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

  if (participant.finalStatus !== "FINALIZED") {
    return { participantStatus: participant.finalStatus };
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

  // 퀴즈가 CLOSED됐고 교사가 공개를 켜둔 경우에만, 비공개 테스트케이스의
  // input/expected를 problemSecrets에서 다시 읽어와 되살려 보여준다(actual
  // 출력은 채점 시점에 애초에 저장되지 않으므로 그대로 없음 — graderClient.ts의
  // 마스킹이 원본이라 여기서 저장된 tcResults 자체는 손대지 않고 읽는 시점에만
  // 덧씌운다).
  const quiz = (await db.collection("quizzes").doc(data.quizId).get()).data() as Quiz;
  const reveal = quiz.status === "CLOSED" && quiz.revealTestCases === true;

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
