import type { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { processInChunks } from "../shared/chunkedConcurrency";
import { grade } from "./graderClient";
import { computeFinalTotal } from "./scoreAggregation";
import type { Participant, Problem, ProblemSecrets, RunResult } from "../models/types";

const CONCURRENCY = 10;

export interface BatchGradeResult {
  processed: number;
  skipped: number;
  failed: number;
  failedParticipantIds: string[];
}

/**
 * `SUBMITTED` 참가자를 채점해 `FINALIZED`로 확정하는 핵심 로직. 교사가 직접
 * 누르는 `batchGrade` 콜러블과, GAS 채점결과 내보내기(exportGradesToSheet/
 * exportQuizResultToSheet)가 내보내기 직전 자동으로 채점을 보충하는 경로
 * 양쪽에서 재사용한다(FR-020~023, research.md §15).
 */
export async function runBatchGrade(db: Firestore, quizId: string): Promise<BatchGradeResult> {
  const quizRef = db.collection("quizzes").doc(quizId);

  const problemsSnap = await quizRef.collection("problems").where("deletedAt", "==", null).get();
  const problems = problemsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Problem) }));
  const secretsByProblemId = new Map(
    await Promise.all(
      problems.map(
        async (problem) =>
          [
            problem.id,
            (
              await quizRef.collection("problemSecrets").doc(problem.id).get()
            ).data() as ProblemSecrets,
          ] as const,
      ),
    ),
  );

  const participantsSnap = await db.collection("participants").where("quizId", "==", quizId).get();
  const allParticipants = participantsSnap.docs
    .map((doc) => ({
      ref: doc.ref,
      participant: doc.data() as Participant,
    }))
    // 교사의 "테스트용 수강생 추가" 항목은 일괄 채점 대상·집계에서 제외한다.
    .filter(({ participant }) => !participant.isTestEntry);

  const toProcess = allParticipants.filter((p) => p.participant.finalStatus === "SUBMITTED");
  const skipped = allParticipants.filter((p) => p.participant.finalStatus === "FINALIZED").length;

  const outcomes = await processInChunks(toProcess, CONCURRENCY, async ({ ref, participant }) => {
    try {
      const runResults: Record<string, RunResult> = {};
      for (const problem of problems) {
        const submission = participant.submissions[problem.id];
        if (submission) {
          const secrets = secretsByProblemId.get(problem.id);
          runResults[problem.id] = await grade(secrets?.items ?? [], submission.code);
        } else {
          runResults[problem.id] = {
            status: "NOT_ATTEMPTED",
            score: 0,
            maxScore: problem.pointsTotal,
            compileErrorMessage: null,
            tcResults: [],
          };
        }
      }

      await ref.update({
        runResults,
        finalTotal: computeFinalTotal(runResults),
        finalStatus: "FINALIZED",
      });
      return { ok: true as const };
    } catch (cause) {
      // 개별 참가자 채점 실패는 전체 일괄 채점을 막지 않고 failed로만 집계하지만,
      // 원인을 남겨두지 않으면 "왜 이 학생만 실패했는지" 나중에 알 방법이 없다
      // (특정 그레이더 오류는 graderClient.ts의 systemError가 이미 로그를 남기지만,
      // Firestore 쓰기 실패 등 다른 원인은 여기서만 잡힌다).
      logger.warn("runBatchGrade: 참가자 채점 실패", {
        quizId,
        studentId: participant.studentId,
        cause,
      });
      return { ok: false as const, studentId: participant.studentId };
    }
  });

  const failed = outcomes.filter((o) => !o.ok);

  return {
    processed: outcomes.length - failed.length,
    skipped,
    failed: failed.length,
    failedParticipantIds: failed.map((f) => f.studentId),
  };
}
