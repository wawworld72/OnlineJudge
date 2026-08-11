import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { practiceRunSchema } from "../shared/schemas";
import { resolveStudentIdByEmail } from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import { isWithin } from "../shared/timeAuthority";
import { domainError } from "../shared/errors";
import { incrementRunCountOrThrow } from "../services/runCountTransaction";
import { getCached, makeCacheKey, setCached } from "../services/practiceRunCache";
import { grade } from "../services/graderClient";
import type { Participant, Problem, ProblemSecrets, Quiz } from "../models/types";

/**
 * `minInstances: 1`로 콜드 스타트를 없앤다 — 연습 실행은 학생이 문제를 풀며 반복 호출하는
 * 경로라 지연이 특히 체감되고, 인메모리 캐시(`practiceRunCache`)도 인스턴스가 계속 살아
 * 있어야 재사용률이 올라간다. 수업 시간에만 트래픽이 있으니 상시 대기 인스턴스 1개 비용은
 * 미미하다.
 */
export const practiceRun = createCallable(
  practiceRunSchema,
  async ({ data, authEmail }) => {
    const db = getFirestore();
    const studentId = await resolveStudentIdByEmail(db, authEmail);

    const quizRef = db.collection("quizzes").doc(data.quizId);
    const quizSnap = await quizRef.get();
    const quiz = quizSnap.exists ? (quizSnap.data() as Quiz) : null;
    if (!quiz || quiz.status !== "OPEN" || !isWithin(quiz.startAt, quiz.endAt)) {
      throw domainError("QUIZ_NOT_ACTIVE", "지금은 연습 실행을 할 수 없는 퀴즈입니다.");
    }

    const problemRef = quizRef.collection("problems").doc(data.problemId);
    const problemSnap = await problemRef.get();
    const problem = problemSnap.exists ? (problemSnap.data() as Problem) : null;
    if (!problem || problem.deletedAt !== null) {
      throw domainError("QUIZ_NOT_ACTIVE", "존재하지 않는 문항입니다.");
    }

    const participantRef = db
      .collection("participants")
      .doc(computeParticipantId(data.quizId, studentId));
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
      throw domainError("QUIZ_NOT_ACTIVE", "먼저 퀴즈에 입장해주세요.");
    }
    const participant = participantSnap.data() as Participant;

    const maxRuns = problem.maxRuns ?? quiz.maxRunsPerProblem;
    const cacheKey = makeCacheKey(data.quizId, data.problemId, data.code, problem.updatedAt.toMillis());
    const cached = getCached(cacheKey);

    if (cached) {
      const used = participant.runsUsedByProblem[data.problemId] ?? 0;
      return { ...cached, remainingRuns: Math.max(0, maxRuns - used), usedCache: true };
    }

    const newCount = await incrementRunCountOrThrow(db, participantRef, data.problemId, maxRuns);

    const secretsSnap = await quizRef.collection("problemSecrets").doc(data.problemId).get();
    const secrets = secretsSnap.data() as ProblemSecrets;

    const result = await grade(secrets.items, data.code);
    setCached(cacheKey, result);

    return { ...result, remainingRuns: Math.max(0, maxRuns - newCount), usedCache: false };
  },
  { minInstances: 1 },
);
