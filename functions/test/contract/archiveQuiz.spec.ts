import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";

vi.mock("../../src/services/sheetsClient", () => ({
  createArchiveSpreadsheet: vi.fn(),
}));

const { createArchiveSpreadsheet } = await import("../../src/services/sheetsClient");
const { archiveQuiz } = await import("../../src/callable/archiveQuiz");

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";

async function seedQuizWithParticipant() {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).set({
    title: "중간고사",
    description: "설명",
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
      runsUsedByProblem: {},
      submissions: { p1: { code: "int main(){}", submittedAt: Timestamp.now() } },
      runResults: {
        p1: { status: "AC", score: 100, maxScore: 100, compileErrorMessage: null, tcResults: [] },
      },
      gradePushedAt: null,
    });
}

describe("archiveQuiz", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(createArchiveSpreadsheet).mockReset();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("4개 탭(퀴즈 개요/참가자 및 확정 점수/문항별 채점 결과/제출 코드)을 만들고 퀴즈 문서에 결과를 기록한다", async () => {
    await seedQuizWithParticipant();
    vi.mocked(createArchiveSpreadsheet).mockResolvedValue({
      spreadsheetId: "sheet-1",
      url: "https://sheets.example/sheet-1",
    });

    const response = await archiveQuiz.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect(response.spreadsheetUrl).toBe("https://sheets.example/sheet-1");

    const tabs = vi.mocked(createArchiveSpreadsheet).mock.calls[0]![1];
    expect(tabs.map((t) => t.name)).toEqual([
      "퀴즈 개요",
      "참가자 및 확정 점수",
      "문항별 채점 결과",
      "제출 코드",
    ]);
    const resultsTab = tabs.find((t) => t.name === "문항별 채점 결과")!;
    expect(resultsTab.rows).toContainEqual(["20240001", "p1", "AC", "100", "100"]);
    const codeTab = tabs.find((t) => t.name === "제출 코드")!;
    expect(codeTab.rows).toContainEqual(["20240001", "p1", "int main(){}"]);

    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.archivedAt).not.toBeNull();
    expect(quiz.archiveSpreadsheetUrl).toBe("https://sheets.example/sheet-1");
  });
});
