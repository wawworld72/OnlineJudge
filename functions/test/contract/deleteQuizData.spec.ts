import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { deleteQuizData } from "../../src/callable/deleteQuizData";

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";

async function seedQuiz(archivedAt: Timestamp | null) {
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
    archivedAt,
    archiveSpreadsheetUrl: archivedAt ? "https://sheets.example/sheet-1" : null,
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
    items: [],
    updatedAt: FieldValue.serverTimestamp(),
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
}

describe("deleteQuizData", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("아카이브가 없으면 NOT_ARCHIVED_YET으로 거부한다", async () => {
    await seedQuiz(null);

    await expect(
      deleteQuizData.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL)),
    ).rejects.toMatchObject({ details: { code: "NOT_ARCHIVED_YET" } });
  });

  it("confirmWithoutArchive: true면 아카이브 없이도 삭제를 강행한다", async () => {
    await seedQuiz(null);

    const response = await deleteQuizData.run(
      makeRequest({ quizId: QUIZ_ID, confirmWithoutArchive: true }, TEACHER_EMAIL),
    );

    expect(response.ok).toBe(true);
  });

  it("아카이브된 퀴즈는 문항/테스트케이스/참가자 데이터를 모두 삭제하고 퀴즈 문서에 deletedAt만 남긴다", async () => {
    await seedQuiz(Timestamp.now());

    await deleteQuizData.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    const db = testDb();
    expect((await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc("p1").get()).exists).toBe(
      false,
    );
    expect(
      (await db.collection("quizzes").doc(QUIZ_ID).collection("problemSecrets").doc("p1").get()).exists,
    ).toBe(false);
    expect((await db.collection("participants").doc(`${QUIZ_ID}_20240001`).get()).exists).toBe(false);

    const quiz = (await db.collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.deletedAt).not.toBeNull();
  });
});
