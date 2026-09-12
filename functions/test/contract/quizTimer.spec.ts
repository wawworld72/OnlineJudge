import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";
import {
  endQuizTimer,
  pauseQuizTimer,
  setQuizTimerDuration,
  startQuizTimer,
} from "../../src/callable/quizTimer";

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
      ...overrides,
    });
}

async function seedDeployableProblem() {
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
}

describe("quizTimer", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  describe("startQuizTimer", () => {
    it("DRAFT + 사전점검 통과 시 지금부터 timerDurationMs만큼 OPEN으로 시작한다", async () => {
      await seedQuiz({ timerDurationMs: 10 * 60 * 1000 });
      await seedDeployableProblem();

      const before = Date.now();
      const response = await startQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID }));
      expect(response.status).toBe("OPEN");

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.status).toBe("OPEN");
      expect(quiz.pausedAt).toBeNull();
      expect(quiz.startAt.toMillis()).toBeGreaterThanOrEqual(before);
      const expectedEnd = quiz.startAt.toMillis() + 10 * 60 * 1000;
      expect(Math.abs(quiz.endAt.toMillis() - expectedEnd)).toBeLessThan(1000);
    });

    it("사전점검을 통과하지 못하면 BLOCKED_BY_PREDEPLOY_CHECK로 거부하고 상태를 바꾸지 않는다", async () => {
      await seedQuiz();

      await expect(
        startQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID })),
      ).rejects.toMatchObject({ details: { code: "BLOCKED_BY_PREDEPLOY_CHECK" } });

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.status).toBe("DRAFT");
    });

    it("이미 실행 중(OPEN, 일시정지 아님)이면 TIMER_ALREADY_RUNNING으로 거부한다", async () => {
      await seedQuiz({ status: "OPEN" });

      await expect(
        startQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID })),
      ).rejects.toMatchObject({ details: { code: "TIMER_ALREADY_RUNNING" } });
    });

    it("일시정지 중이면 멈춰있던 시간만큼 종료 시각을 늦추며 재개한다", async () => {
      const endAtMs = Date.now() + 5 * 60 * 1000;
      const pausedAtMs = Date.now() - 20_000; // 20초 전에 멈춤
      await seedQuiz({
        status: "OPEN",
        endAt: Timestamp.fromMillis(endAtMs),
        pausedAt: Timestamp.fromMillis(pausedAtMs),
      });

      const response = await startQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID }));
      expect(response.status).toBe("OPEN");

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.pausedAt).toBeNull();
      // 대략 20초(멈춰있던 시간)만큼 늦춰졌는지 확인(오차범위 허용).
      const shiftedBy = quiz.endAt.toMillis() - endAtMs;
      expect(shiftedBy).toBeGreaterThan(15_000);
      expect(shiftedBy).toBeLessThan(25_000);
    });

    it("이미 마감(CLOSED)된 퀴즈는 QUIZ_CLOSED로 거부한다", async () => {
      await seedQuiz({ status: "CLOSED" });

      await expect(
        startQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID })),
      ).rejects.toMatchObject({ details: { code: "QUIZ_CLOSED" } });
    });
  });

  describe("pauseQuizTimer", () => {
    it("실행 중이면 pausedAt을 지금으로 채운다", async () => {
      await seedQuiz({ status: "OPEN" });

      const before = Date.now();
      await pauseQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID }));

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.pausedAt.toMillis()).toBeGreaterThanOrEqual(before);
    });

    it("DRAFT/CLOSED/이미 일시정지 중이면 TIMER_NOT_RUNNING으로 거부한다", async () => {
      await seedQuiz({ status: "DRAFT" });
      await expect(
        pauseQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID })),
      ).rejects.toMatchObject({ details: { code: "TIMER_NOT_RUNNING" } });

      await seedQuiz({ status: "OPEN", pausedAt: Timestamp.fromMillis(Date.now() - 1000) });
      await expect(
        pauseQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID })),
      ).rejects.toMatchObject({ details: { code: "TIMER_NOT_RUNNING" } });
    });
  });

  describe("endQuizTimer", () => {
    it("실행 중이면 endAt을 지금으로 당기고 pausedAt을 지운다", async () => {
      await seedQuiz({ status: "OPEN", endAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000) });

      const before = Date.now();
      await endQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID }));

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.endAt.toMillis()).toBeGreaterThanOrEqual(before);
      expect(quiz.pausedAt).toBeNull();
    });

    it("일시정지 중이었어도 종료할 수 있다", async () => {
      await seedQuiz({
        status: "OPEN",
        pausedAt: Timestamp.fromMillis(Date.now() - 1000),
      });

      await endQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID }));

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.pausedAt).toBeNull();
    });

    it("DRAFT/CLOSED면 TIMER_NOT_RUNNING으로 거부한다", async () => {
      await seedQuiz({ status: "DRAFT" });
      await expect(endQuizTimer.run(makeTeacherRequest({ quizId: QUIZ_ID }))).rejects.toMatchObject(
        { details: { code: "TIMER_NOT_RUNNING" } },
      );
    });
  });

  describe("setQuizTimerDuration", () => {
    it("상태와 무관하게 timerDurationMs를 그대로 갱신한다", async () => {
      await seedQuiz({ status: "DRAFT" });

      const response = await setQuizTimerDuration.run(
        makeTeacherRequest({ quizId: QUIZ_ID, timerDurationMs: 15 * 60 * 1000 }),
      );
      expect(response.timerDurationMs).toBe(15 * 60 * 1000);

      const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
      expect(quiz.timerDurationMs).toBe(15 * 60 * 1000);
    });
  });
});
