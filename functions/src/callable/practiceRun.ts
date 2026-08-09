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

export const practiceRun = createCallable(practiceRunSchema, async ({ data, authEmail }) => {
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
});
