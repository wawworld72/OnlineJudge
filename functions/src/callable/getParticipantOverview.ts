import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { getParticipantOverviewSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { getParticipantOverviewData } from "../services/participantOverview";

export const getParticipantOverview = createCallable(
  getParticipantOverviewSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    const db = getFirestore();
    const participants = await getParticipantOverviewData(db, data.quizId);
    return { participants };
  },
);
