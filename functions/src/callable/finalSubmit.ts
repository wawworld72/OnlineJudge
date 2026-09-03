import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { finalSubmitSchema } from "../shared/schemas";
import { resolveStudentIdByEmail } from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import { isAfter } from "../shared/timeAuthority";
import { domainError } from "../shared/errors";
import type { Participant, Quiz, Submission } from "../models/types";

export const finalSubmit = createCallable(finalSubmitSchema, async ({ data, authEmail }) => {
  const db = getFirestore();
  const studentId = await resolveStudentIdByEmail(db, authEmail);

  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) {
    throw domainError("QUIZ_CLOSED", "존재하지 않는 퀴즈입니다.");
  }
  const quiz = quizSnap.data() as Quiz;

  const validProblemIds = new Set(
    (await quizRef.collection("problems").where("deletedAt", "==", null).get()).docs.map(
      (doc) => doc.id,
    ),
  );

  const participantRef = db
    .collection("participants")
    .doc(computeParticipantId(data.quizId, studentId));

  const alreadyFinal = await db.runTransaction(async (tx) => {
    const snap = await tx.get(participantRef);
    if (!snap.exists) {
      throw domainError("QUIZ_CLOSED", "먼저 퀴즈에 입장해주세요.");
    }
    const participant = snap.data() as Participant;

    if (participant.finalStatus !== "IN_PROGRESS") {
      return participant;
    }

    if (!participant.isTestEntry && (quiz.status === "CLOSED" || isAfter(quiz.endAt))) {
      throw domainError("QUIZ_CLOSED", "제출 마감된 퀴즈입니다.");
    }

    const submissions: Record<string, Submission> = {};
    for (const submission of data.submissions) {
      if (!validProblemIds.has(submission.problemId)) continue;
      submissions[submission.problemId] = {
        code: submission.code,
        submittedAt: FieldValue.serverTimestamp() as never,
      };
    }

    tx.update(participantRef, {
      submissions,
      finalStatus: "SUBMITTED",
      finalSubmittedAt: FieldValue.serverTimestamp(),
    });

    return null;
  });

  if (alreadyFinal) {
    return {
      participantStatus: alreadyFinal.finalStatus,
      finalSubmittedAt: alreadyFinal.finalSubmittedAt?.toMillis() ?? null,
    };
  }

  const committed = (await participantRef.get()).data() as Participant;
  return {
    participantStatus: committed.finalStatus,
    finalSubmittedAt: committed.finalSubmittedAt?.toMillis() ?? null,
  };
});
