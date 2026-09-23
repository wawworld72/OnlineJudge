import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";
import { setClipboardRestriction } from "../../src/callable/setClipboardRestriction";

const QUIZ_ID = "quiz-1";

async function seedQuiz(overrides: Record<string, unknown> = {}) {
  await testDb()
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
      title: "중간고사",
      description: "",
      startAt: Timestamp.fromMillis(Date.now()),
      endAt: Timestamp.fromMillis(Date.now() + 60_000),
      accessCode: "ABC123",
      status: "DRAFT",
      maxRunsPerProblem: 5,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
      timerDurationMs: 30 * 60 * 1000,
      pausedAt: null,
      revealTestCases: false,
      clipboardRestricted: false,
      ...overrides,
    });
}

describe("setClipboardRestriction", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("상태와 무관하게 clipboardRestricted를 그대로 갱신한다", async () => {
    await seedQuiz({ status: "DRAFT" });

    const response = await setClipboardRestriction.run(
      makeTeacherRequest({ quizId: QUIZ_ID, restricted: true }),
    );
    expect(response.clipboardRestricted).toBe(true);

    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.clipboardRestricted).toBe(true);
  });

  it("다시 꺼서 되돌릴 수 있다", async () => {
    await seedQuiz({ status: "OPEN", clipboardRestricted: true });

    await setClipboardRestriction.run(makeTeacherRequest({ quizId: QUIZ_ID, restricted: false }));

    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.clipboardRestricted).toBe(false);
  });
});
