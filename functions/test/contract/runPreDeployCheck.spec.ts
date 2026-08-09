import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { runPreDeployCheck } from "../../src/callable/runPreDeployCheck";
import type { CheckItem } from "../../src/services/preDeployCheck";

const TEACHER_EMAIL = "teacher@hoseo.edu";
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
      ...overrides,
    });
}

async function seedProblemWithTestCase(pointsTotal = 100) {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc("p1").set({
    order: 0,
    title: "문제1",
    description: "",
    initialCode: "",
    maxRuns: null,
    pointsTotal,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problemSecrets").doc("p1").set({
    items:
      pointsTotal > 0
        ? [{ tcId: "tc1", tcNo: 1, input: "1", expected: "1", points: pointsTotal, isPublic: true, description: "" }]
        : [],
    updatedAt: FieldValue.serverTimestamp(),
  });
}

describe("runPreDeployCheck", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("데이터 변경 없이 문항·테스트케이스·배점·출입코드·기간이 모두 정상이면 차단 항목이 없다", async () => {
    await seedQuiz();
    await seedProblemWithTestCase();

    const response = await runPreDeployCheck.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect(response.blockingCount).toBe(0);
    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.status).toBe("DRAFT");
  });

  it("문항이 하나도 없으면 차단한다", async () => {
    await seedQuiz();

    const response = await runPreDeployCheck.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect(response.blockingCount).toBeGreaterThan(0);
    expect((response.items as CheckItem[]).find((i) => i.key === "problemsExist")?.level).toBe("BLOCK");
  });

  it("문항에 테스트케이스가 없으면 차단한다", async () => {
    await seedQuiz();
    await seedProblemWithTestCase(0);

    const response = await runPreDeployCheck.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect((response.items as CheckItem[]).find((i) => i.key === "testCasesExist")?.level).toBe("BLOCK");
  });

  it("응시 기간이 역순이면 차단한다", async () => {
    await seedQuiz({
      startAt: Timestamp.fromMillis(Date.now() + 60_000),
      endAt: Timestamp.fromMillis(Date.now()),
    });
    await seedProblemWithTestCase();

    const response = await runPreDeployCheck.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect((response.items as CheckItem[]).find((i) => i.key === "periodOrder")?.level).toBe("BLOCK");
  });

  it("분반이 연동된 경우 Classroom 항목은 WARN 이하로만 판정하며 절대 차단하지 않는다", async () => {
    await seedQuiz({ courseId: "course-1" });
    await seedProblemWithTestCase();

    const response = await runPreDeployCheck.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    const rosterItem = (response.items as CheckItem[]).find((i) => i.key === "classroomRosterSync");
    const deployItem = (response.items as CheckItem[]).find((i) => i.key === "classroomDeployment");
    expect(rosterItem?.level).not.toBe("BLOCK");
    expect(deployItem?.level).not.toBe("BLOCK");
    expect(response.blockingCount).toBe(0);
  });
});
