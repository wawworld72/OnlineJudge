import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { getQuizForEdit } from "../../src/callable/getQuizForEdit";

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";

describe("getQuizForEdit", () => {
  beforeEach(async () => {
    await clearFirestore();
    const db = testDb();
    await db.collection("quizzes").doc(QUIZ_ID).set({
      title: "중간고사",
      description: "설명",
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
    await db.collection("quizzes").doc(QUIZ_ID).collection("problemSecrets").doc("p1").set({
      items: [{ tcId: "tc1", tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true, description: "" }],
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc("deleted").set({
      order: 1,
      title: "삭제된 문제",
      description: "",
      initialCode: "",
      maxRuns: null,
      pointsTotal: 0,
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: Timestamp.now(),
    });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("퀴즈 전체 필드와 삭제되지 않은 문항·테스트케이스(정답 포함)를 반환한다", async () => {
    const response = await getQuizForEdit.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect(response.title).toBe("중간고사");
    expect(response.accessCode).toBe("ABC123");
    expect(response.problems).toHaveLength(1);
    expect(response.problems[0]!.problemId).toBe("p1");
    expect(response.problems[0]!.testCases[0]!.expected).toBe("1");
  });
});
