import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { getParticipantOverview, type OverviewItem } from "../../src/callable/getParticipantOverview";

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";

async function seedQuiz(courseId: string | null) {
  await testDb().collection("quizzes").doc(QUIZ_ID).set({
    title: "중간고사",
    description: "",
    startAt: ts(-60_000),
    endAt: ts(60_000),
    accessCode: "ABC123",
    status: "OPEN",
    maxRunsPerProblem: 5,
    courseId,
    courseWorkId: null,
    courseWorkLink: null,
    archivedAt: null,
    archiveSpreadsheetUrl: null,
    deletedAt: null,
  });
}

async function seedParticipant(studentId: string, finalStatus: "IN_PROGRESS" | "SUBMITTED" | "FINALIZED") {
  await testDb()
    .collection("participants")
    .doc(`${QUIZ_ID}_${studentId}`)
    .set({
      quizId: QUIZ_ID,
      studentId,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus,
      finalSubmittedAt: finalStatus === "IN_PROGRESS" ? null : Timestamp.now(),
      finalTotal: finalStatus === "FINALIZED" ? 90 : 0,
      runsUsedByProblem: {},
      submissions: {},
      runResults: {},
      gradePushedAt: null,
    });
}

describe("getParticipantOverview", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("분반이 연동된 경우 명부 전원을 포함하며, 미입장 학생은 NOT_ENTERED로 표시한다", async () => {
    await seedQuiz("course-1");
    await testDb().collection("rosters").doc("course-1_20240001").set({
      courseId: "course-1",
      studentId: "20240001",
      name: "홍길동",
      email: "hong@hoseo.edu",
      syncedAt: FieldValue.serverTimestamp(),
    });
    await testDb().collection("rosters").doc("course-1_20240002").set({
      courseId: "course-1",
      studentId: "20240002",
      name: "김철수",
      email: "kim@hoseo.edu",
      syncedAt: FieldValue.serverTimestamp(),
    });
    await seedParticipant("20240001", "FINALIZED");

    const response = await getParticipantOverview.run(
      makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL),
    );

    const participants = response.participants as OverviewItem[];
    expect(participants).toHaveLength(2);
    const hong = participants.find((p) => p.studentId === "20240001")!;
    expect(hong.status).toBe("FINALIZED");
    expect(hong.finalTotal).toBe(90);
    const kim = participants.find((p) => p.studentId === "20240002")!;
    expect(kim.status).toBe("NOT_ENTERED");
    expect(kim.name).toBe("김철수");
  });

  it("분반이 연동되지 않으면 이미 입장한 참가자만 반환한다", async () => {
    await seedQuiz(null);
    await seedParticipant("20240001", "IN_PROGRESS");

    const response = await getParticipantOverview.run(
      makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL),
    );

    expect(response.participants).toHaveLength(1);
    expect(response.participants[0]!.status).toBe("IN_PROGRESS");
  });
});
