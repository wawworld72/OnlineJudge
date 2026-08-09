import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { getParticipantOverviewSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import type { Participant, Quiz, Roster } from "../models/types";

export interface OverviewItem {
  studentId: string;
  name: string;
  status: "NOT_ENTERED" | "IN_PROGRESS" | "SUBMITTED" | "FINALIZED";
  submittedAt?: number;
  finalTotal?: number;
}

/**
 * FR-025. `participants`(입장한 학생만 문서가 있음)와 `rosters`(분반 대상 학생 전원)를
 * 합쳐 "미입장" 학생까지 포함한 전체 현황을 만든다(research.md §20) — `courseId`가 없는
 * 퀴즈는 대상 전원을 판단할 명부가 없으므로 이미 입장한 참가자만 반환한다.
 */
export const getParticipantOverview = createCallable(
  getParticipantOverviewSchema,
  async ({ data, authEmail }) => {
    requireTeacher(authEmail);
    const db = getFirestore();
    const quiz = (await db.collection("quizzes").doc(data.quizId).get()).data() as Quiz;

    // T023 복합 인덱스(quizId ASC, finalSubmittedAt ASC)를 그대로 사용한다.
    const participantsSnap = await db
      .collection("participants")
      .where("quizId", "==", data.quizId)
      .orderBy("finalSubmittedAt")
      .get();

    const participantByStudentId = new Map(
      participantsSnap.docs.map((doc) => [doc.data().studentId as string, doc.data() as Participant]),
    );

    function toItem(studentId: string, name: string): OverviewItem {
      const participant = participantByStudentId.get(studentId);
      if (!participant) return { studentId, name, status: "NOT_ENTERED" };
      const item: OverviewItem = { studentId, name, status: participant.finalStatus };
      if (participant.finalSubmittedAt) item.submittedAt = participant.finalSubmittedAt.toMillis();
      if (participant.finalStatus === "FINALIZED") item.finalTotal = participant.finalTotal;
      return item;
    }

    if (!quiz.courseId) {
      const participants = participantsSnap.docs.map((doc) =>
        toItem(doc.data().studentId as string, doc.data().studentId as string),
      );
      return { participants };
    }

    const rosterSnap = await db.collection("rosters").where("courseId", "==", quiz.courseId).get();
    const rosterEntries = rosterSnap.docs.map((doc) => doc.data() as Roster);

    const enteredStudentIds = new Set(participantByStudentId.keys());
    const enteredInOrder = participantsSnap.docs
      .map((doc) => doc.data() as Participant)
      .map((participant) => {
        const roster = rosterEntries.find((r) => r.studentId === participant.studentId);
        return toItem(participant.studentId, roster?.name ?? participant.studentId);
      });
    const notEntered = rosterEntries
      .filter((roster) => !enteredStudentIds.has(roster.studentId))
      .map((roster) => toItem(roster.studentId, roster.name));

    return { participants: [...enteredInOrder, ...notEntered] };
  },
);
