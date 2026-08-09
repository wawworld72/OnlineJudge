import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { getMyResultSchema } from "../shared/schemas";
import { resolveStudentIdByEmail } from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import { domainError } from "../shared/errors";
import type { Participant, Problem } from "../models/types";

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

  const perProblem = Object.entries(participant.runResults).map(([problemId, result]) => ({
    problemId,
    status: result.status,
    score: result.score,
    maxScore: result.maxScore,
    tcResults: result.tcResults,
  }));

  return {
    participantStatus: participant.finalStatus,
    finalTotal: participant.finalTotal,
    maxTotal,
    perProblem,
  };
});
