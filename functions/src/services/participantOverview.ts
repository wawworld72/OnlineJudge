import type { Firestore } from "firebase-admin/firestore";
import type { Participant, Quiz, Roster, Student } from "../models/types";

export interface OverviewItem {
  studentId: string;
  name: string;
  email: string | null;
  status: "NOT_ENTERED" | "IN_PROGRESS" | "SUBMITTED" | "FINALIZED";
  submittedAt?: number;
  finalTotal?: number;
}

/**
 * FR-025. `participants`(입장한 학생만 문서가 있음)와 `rosters`(분반 대상 학생 전원)를
 * 합쳐 "미입장" 학생까지 포함한 전체 현황을 만든다(research.md §20) — `courseId`가 없는
 * 퀴즈는 대상 전원을 판단할 명부가 없으므로 이미 입장한 참가자만 반환한다.
 * `getParticipantOverview`(교사 화면)와 `exportGradesToSheet`(Apps Script 연동)가
 * 같은 조회 로직을 공유한다 — 둘 다 "지금 시점의 참가자 현황"이라는 같은 데이터를
 * 서로 다른 인증 경로로 제공할 뿐이다.
 */
export async function getParticipantOverviewData(
  db: Firestore,
  quizId: string,
): Promise<OverviewItem[]> {
  const quizSnap = await db.collection("quizzes").doc(quizId).get();
  if (!quizSnap.exists) {
    throw new Error("존재하지 않는 퀴즈입니다.");
  }
  const quiz = quizSnap.data() as Quiz;

  // T023 복합 인덱스(quizId ASC, finalSubmittedAt ASC)를 그대로 사용한다.
  const participantsSnap = await db
    .collection("participants")
    .where("quizId", "==", quizId)
    .orderBy("finalSubmittedAt")
    .get();

  // 교사의 "테스트용 수강생 추가" 항목(isTestEntry)은 실제 학생 현황에서 항상 제외한다.
  const participantDocs = participantsSnap.docs.filter(
    (doc) => !(doc.data() as Participant).isTestEntry,
  );

  const participantByStudentId = new Map(
    participantDocs.map((doc) => [doc.data().studentId as string, doc.data() as Participant]),
  );

  function toItem(studentId: string, name: string, email: string | null): OverviewItem {
    const participant = participantByStudentId.get(studentId);
    if (!participant) return { studentId, name, email, status: "NOT_ENTERED" };
    const item: OverviewItem = { studentId, name, email, status: participant.finalStatus };
    if (participant.finalSubmittedAt) item.submittedAt = participant.finalSubmittedAt.toMillis();
    if (participant.finalStatus === "FINALIZED") item.finalTotal = participant.finalTotal;
    return item;
  }

  if (!quiz.courseId) {
    if (participantDocs.length === 0) return [];
    // 비연동 퀴즈는 명부가 없어 이메일도 이름과 마찬가지로 students 컬렉션에서 직접
    // 가져와야 한다 — 참가자 수만큼 db.getAll()로 한 번에 배치 조회한다.
    const studentIds = participantDocs.map((doc) => doc.data().studentId as string);
    const studentSnaps = await db.getAll(
      ...studentIds.map((studentId) => db.collection("students").doc(studentId)),
    );
    const emailByStudentId = new Map(
      studentSnaps.map((snap) => [snap.id, (snap.data() as Student | undefined)?.email ?? null]),
    );
    return studentIds.map((studentId) =>
      toItem(studentId, studentId, emailByStudentId.get(studentId) ?? null),
    );
  }

  const rosterSnap = await db.collection("rosters").where("courseId", "==", quiz.courseId).get();
  const rosterEntries = rosterSnap.docs
    .map((doc) => doc.data() as Roster)
    .filter((roster) => !roster.isTestEntry);

  const enteredStudentIds = new Set(participantByStudentId.keys());
  const enteredInOrder = participantDocs
    .map((doc) => doc.data() as Participant)
    .map((participant) => {
      const roster = rosterEntries.find((r) => r.studentId === participant.studentId);
      return toItem(
        participant.studentId,
        roster?.name ?? participant.studentId,
        roster?.email ?? null,
      );
    });
  const notEntered = rosterEntries
    .filter((roster) => !enteredStudentIds.has(roster.studentId))
    .map((roster) => toItem(roster.studentId, roster.name, roster.email));

  return [...enteredInOrder, ...notEntered];
}
