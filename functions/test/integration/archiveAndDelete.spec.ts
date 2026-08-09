import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";

vi.mock("../../src/services/sheetsClient", () => ({
  createArchiveSpreadsheet: vi.fn(),
}));

const { createArchiveSpreadsheet } = await import("../../src/services/sheetsClient");
const { archiveQuiz } = await import("../../src/callable/archiveQuiz");
const { deleteQuizData } = await import("../../src/callable/deleteQuizData");

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";

describe("아카이브 없이 삭제 시도(거부) → 아카이브 실행 → 삭제 실행 → 데이터 조회 시 존재하지 않음", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(createArchiveSpreadsheet).mockReset();

    const db = testDb();
    await db.collection("quizzes").doc(QUIZ_ID).set({
      title: "중간고사",
      description: "",
      startAt: ts(-60_000),
      endAt: ts(-1_000),
      accessCode: "ABC123",
      status: "CLOSED",
      maxRunsPerProblem: 5,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
    });
    await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc("p1").set({
      order: 0,
      title: "문제1",
      description: "",
      initialCode: "",
      maxRuns: null,
      pointsTotal: 100,
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });
    await db
      .collection("participants")
      .doc(`${QUIZ_ID}_20240001`)
      .set({
        quizId: QUIZ_ID,
        studentId: "20240001",
        enteredAt: FieldValue.serverTimestamp(),
        finalStatus: "FINALIZED",
        finalSubmittedAt: Timestamp.now(),
        finalTotal: 100,
        completedCount: 1,
        totalCount: 1,
        runsUsedByProblem: {},
        submissions: {},
        runResults: {},
        gradePushedAt: null,
      });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("전체 흐름을 순서대로 완료한다", async () => {
    await expect(
      deleteQuizData.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL)),
    ).rejects.toMatchObject({ details: { code: "NOT_ARCHIVED_YET" } });

    vi.mocked(createArchiveSpreadsheet).mockResolvedValue({
      spreadsheetId: "sheet-1",
      url: "https://sheets.example/sheet-1",
    });
    const archiveResponse = await archiveQuiz.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));
    expect(archiveResponse.spreadsheetUrl).toBe("https://sheets.example/sheet-1");

    await deleteQuizData.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    const db = testDb();
    expect((await db.collection("participants").doc(`${QUIZ_ID}_20240001`).get()).exists).toBe(false);
    expect(
      (await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc("p1").get()).exists,
    ).toBe(false);
  });
});
