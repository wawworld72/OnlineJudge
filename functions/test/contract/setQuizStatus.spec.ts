import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";
import { setQuizStatus } from "../../src/callable/setQuizStatus";

const QUIZ_ID = "quiz-1";

async function seedQuiz() {
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
    });
}

describe("setQuizStatus", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedQuiz();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("차단 항목이 있으면 OPEN 전환을 거부한다", async () => {
    await expect(
      setQuizStatus.run(makeTeacherRequest({ quizId: QUIZ_ID, status: "OPEN" })),
    ).rejects.toMatchObject({ details: { code: "BLOCKED_BY_PREDEPLOY_CHECK" } });

    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.status).toBe("DRAFT");
  });

  it("차단 항목이 없으면 OPEN으로 전환된다", async () => {
    const db = testDb();
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
      .collection("quizzes")
      .doc(QUIZ_ID)
      .collection("problemSecrets")
      .doc("p1")
      .set({
        items: [
          {
            tcId: "tc1",
            tcNo: 1,
            input: "1",
            expected: "1",
            points: 100,
            isPublic: true,
            description: "",
          },
        ],
        updatedAt: FieldValue.serverTimestamp(),
      });

    const response = await setQuizStatus.run(
      makeTeacherRequest({ quizId: QUIZ_ID, status: "OPEN" }),
    );

    expect(response.status).toBe("OPEN");
    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.status).toBe("OPEN");
  });

  it("CLOSED로 전환할 때는 배포 전 점검을 요구하지 않는다", async () => {
    const response = await setQuizStatus.run(
      makeTeacherRequest({ quizId: QUIZ_ID, status: "CLOSED" }),
    );
    expect(response.status).toBe("CLOSED");
  });
});
