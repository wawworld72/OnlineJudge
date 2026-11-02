import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { getMyResultSchema } from "../shared/schemas";
import { resolveStudentIdByEmail } from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import { domainError } from "../shared/errors";
import type { Participant, Problem, ProblemSecrets, Quiz } from "../models/types";

export const getMyResult = createCallable(getMyResultSchema, async ({ data, authEmail }) => {
  const db = getFirestore();
  const studentId = await resolveStudentIdByEmail(db, authEmail);

  const participantRef = db
    .collection("participants")
    .doc(computeParticipantId(data.quizId, studentId));
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) {
    throw domainError("NOT_ENTERED", "먼저 퀴즈에 입장해주세요.");
  }
  const participant = participantSnap.data() as Participant;

  if (participant.finalStatus === "IN_PROGRESS") {
    return { participantStatus: participant.finalStatus };
  }

  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;
  // 최종 제출을 마친 학생에게는 비공개 테스트케이스의 input/expected를 자동으로 보여준다
  // (교사가 퀴즈별로 끌 수 있는 안전장치 — 필드가 없는 기존 퀴즈는 켜진 것으로 본다).
  // 본인이 아직 제출하지 않은 상태(IN_PROGRESS)는 위에서 이미 걸러졌다.
  const reveal = quiz.revealTestCases !== false;

  // 아직 채점 전(SUBMITTED)이라 결과(runResults)는 없지만, 제출을 마쳤으므로 문항별 테스트
  // 케이스 입력·기대 출력은 바로 보여준다. 정답 여부(passed)는 채점 후에만 알 수 있다.
  if (participant.finalStatus === "SUBMITTED") {
    if (!reveal) return { participantStatus: participant.finalStatus };
    const problemsSnap = await quizRef
      .collection("problems")
      .where("deletedAt", "==", null)
      .orderBy("order")
      .get();
    const secretSnaps =
      problemsSnap.docs.length > 0
        ? await db.getAll(
            ...problemsSnap.docs.map((doc) => quizRef.collection("problemSecrets").doc(doc.id)),
          )
        : [];
    const testCases = secretSnaps.map((snap) => ({
      problemId: snap.id,
      testCases: ((snap.data() as ProblemSecrets | undefined)?.items ?? []).map((item) => ({
        tcId: item.tcId,
        isPublic: item.isPublic,
        points: item.points,
        input: item.input,
        expectedOutput: item.expected,
      })),
    }));
    return { participantStatus: participant.finalStatus, testCases };
  }

  const problemsSnap = await db
    .collection("quizzes")
    .doc(data.quizId)
    .collection("problems")
    .where("deletedAt", "==", null)
    .get();
  const maxTotal = problemsSnap.docs.reduce(
    (sum, doc) => sum + (doc.data() as Problem).pointsTotal,
    0,
  );

  // 공개가 켜져 있으면 비공개 테스트케이스의 input/expected를 problemSecrets에서 다시
  // 읽어와 되살려 보여준다(actual 출력은 채점 시점에 애초에 저장되지 않으므로 그대로
  // 없음 — graderClient.ts의 마스킹이 원본이라 여기서 저장된 tcResults 자체는 손대지
  // 않고 읽는 시점에만 덧씌운다).

  const problemIds = Object.keys(participant.runResults);
  const secretsById =
    reveal && problemIds.length > 0
      ? new Map(
          (
            await db.getAll(
              ...problemIds.map((id) =>
                db.collection("quizzes").doc(data.quizId).collection("problemSecrets").doc(id),
              ),
            )
          ).map((snap) => [snap.id, (snap.data() as ProblemSecrets | undefined)?.items ?? []]),
        )
      : null;

  const perProblem = Object.entries(participant.runResults).map(([problemId, result]) => {
    const items = secretsById?.get(problemId);
    const tcResults = items
      ? result.tcResults.map((tc) => {
          if (tc.isPublic) return tc;
          const item = items.find((i) => i.tcId === tc.tcId);
          return item ? { ...tc, input: item.input, expectedOutput: item.expected } : tc;
        })
      : result.tcResults;
    return {
      problemId,
      status: result.status,
      score: result.score,
      maxScore: result.maxScore,
      tcResults,
    };
  });

  return {
    participantStatus: participant.finalStatus,
    finalTotal: participant.finalTotal,
    maxTotal,
    perProblem,
  };
});
