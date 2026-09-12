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
 * `minInstances: 1`은 쓰지 않는다 — Cloud Functions 2세대는 minInstances>0이면 그
 * 인스턴스의 CPU·메모리 대기 시간을 호출 여부와 무관하게 24시간 내내 과금한다("수업
 * 시간에만 트래픽이 있으니 비용이 미미하다"는 가정은 틀렸다 — 수업 없는 시간에도 계속
 * 과금됨). 연습 실행은 학생이 반복 호출하는 경로라 콜드 스타트가 상대적으로 더
 * 체감되긴 하지만, 인스턴스가 한 번 뜨면 이후 호출은 따뜻하게 재사용되고
 * `practiceRunCache`도 그 안에서 계속 동작하므로, 최초 1회 지연만 감수하면 된다.
 */
export const practiceRun = createCallable(practiceRunSchema, async ({ data, authEmail }) => {
  const db = getFirestore();
  const studentId = await resolveStudentIdByEmail(db, authEmail);

  // 참가자를 먼저 조회한다 — `isTestEntry`(교사의 "테스트용 수강생 추가" 항목) 여부를
  // 알아야 아래 퀴즈 상태/시간 게이트를 적용할지 판단할 수 있다.
  const participantRef = db
    .collection("participants")
    .doc(computeParticipantId(data.quizId, studentId));
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) {
    throw domainError("QUIZ_NOT_ACTIVE", "먼저 퀴즈에 입장해주세요.");
  }
  const participant = participantSnap.data() as Participant;

  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quizSnap = await quizRef.get();
  const quiz = quizSnap.exists ? (quizSnap.data() as Quiz) : null;
  if (
    !quiz ||
    (!participant.isTestEntry &&
      (quiz.status !== "OPEN" || quiz.pausedAt || !isWithin(quiz.startAt, quiz.endAt)))
  ) {
    throw domainError("QUIZ_NOT_ACTIVE", "지금은 연습 실행을 할 수 없는 퀴즈입니다.");
  }

  const problemRef = quizRef.collection("problems").doc(data.problemId);
  const problemSnap = await problemRef.get();
  const problem = problemSnap.exists ? (problemSnap.data() as Problem) : null;
  if (!problem || problem.deletedAt !== null) {
    throw domainError("QUIZ_NOT_ACTIVE", "존재하지 않는 문항입니다.");
  }

  const maxRuns = problem.maxRuns ?? quiz.maxRunsPerProblem;
  const cacheKey = makeCacheKey(
    data.quizId,
    data.problemId,
    data.code,
    problem.updatedAt.toMillis(),
  );
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
