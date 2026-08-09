import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { getParticipantDetailSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { computeParticipantId } from "../shared/participantId";
import { domainError } from "../shared/errors";
import type { Participant } from "../models/types";

export const getParticipantDetail = createCallable(
  getParticipantDetailSchema,
  async ({ data, authEmail }) => {
    requireTeacher(authEmail);
    const db = getFirestore();
    const participantId = computeParticipantId(data.quizId, data.studentId);
    const snap = await db.collection("participants").doc(participantId).get();
    if (!snap.exists) {
      throw domainError("NOT_ENTERED", "아직 입장하지 않은 학생입니다.");
    }
    const participant = snap.data() as Participant;
    return { submissions: participant.submissions, runResults: participant.runResults };
  },
);
