import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { listQuizzes } from "../../src/callable/listQuizzes";

const TEACHER_EMAIL = "teacher@hoseo.edu";

describe("listQuizzes", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("삭제되지 않은 모든 상태(DRAFT/OPEN/CLOSED)의 퀴즈를 반환한다", async () => {
    const db = testDb();
    const base = {
      description: "",
      startAt: Timestamp.fromMillis(Date.now()),
      endAt: Timestamp.fromMillis(Date.now() + 60_000),
      accessCode: "ABC123",
      maxRunsPerProblem: 5,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
    };
    await db.collection("quizzes").doc("draft-quiz").set({ ...base, title: "임시", status: "DRAFT", deletedAt: null });
    await db.collection("quizzes").doc("open-quiz").set({ ...base, title: "공개", status: "OPEN", deletedAt: null });
    await db
      .collection("quizzes")
      .doc("deleted-quiz")
      .set({ ...base, title: "삭제됨", status: "CLOSED", deletedAt: Timestamp.now() });

    const response = await listQuizzes.run(makeRequest({}, TEACHER_EMAIL));

    const quizIds: string[] = response.quizzes.map((q: { quizId: string }) => q.quizId);
    expect(quizIds.sort()).toEqual(["draft-quiz", "open-quiz"]);
  });

  it("교사가 아닌 계정은 거부한다", async () => {
    await expect(listQuizzes.run(makeRequest({}, "student1@hoseo.edu"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
