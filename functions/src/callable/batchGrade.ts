import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { batchGradeSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { processInChunks } from "../shared/chunkedConcurrency";
import { grade } from "../services/graderClient";
import { computeFinalTotal } from "../services/scoreAggregation";
import type { Participant, Problem, ProblemSecrets, Quiz, RunResult } from "../models/types";

const CONCURRENCY = 10;

/**
 * FR-020~023, research.md §15. 최대 100명 × 문항 5개 규모를 감당하기 위해 `timeoutSeconds`를
 * 늘리고 참가자 처리를 청크로 나눈다.
 */
export const batchGrade = createCallable(
  batchGradeSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    const db = getFirestore();
    const quizRef = db.collection("quizzes").doc(data.quizId);
    const quiz = (await quizRef.get()).data() as Quiz;

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

    const participantsSnap = await db
      .collection("participants")
      .where("quizId", "==", data.quizId)
      .get();
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
      } catch {
        return { ok: false as const, studentId: participant.studentId };
      }
    });

    const failed = outcomes.filter((o) => !o.ok);

    let classroomGradesPending = false;
    if (quiz.courseId) {
      const finalizedSnap = await db
        .collection("participants")
        .where("quizId", "==", data.quizId)
        .where("finalStatus", "==", "FINALIZED")
        .get();
      classroomGradesPending = finalizedSnap.docs.some(
        (doc) => (doc.data() as Participant).gradePushedAt === null,
      );
    }

    return {
      processed: outcomes.length - failed.length,
      skipped,
      failed: failed.length,
      failedParticipantIds: failed.map((f) => f.studentId),
      classroomGradesPending,
    };
  },
  { timeoutSeconds: 540 },
);
