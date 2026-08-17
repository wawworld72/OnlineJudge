import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { upsertQuiz } from "../../src/callable/upsertQuiz";

const TEACHER_EMAIL = "teacher@hoseo.edu";

describe("upsertQuiz", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("생성한 퀴즈는 항상 DRAFT 상태로 시작한다", async () => {
    const response = await upsertQuiz.run(
      makeRequest(
        {
          subjectName: "컴퓨터프로그래밍심화",
          title: "중간고사",
          description: "설명",
          startAt: Date.now(),
          endAt: Date.now() + 60_000,
          accessCode: "ABC123",
          maxRunsPerProblem: 5,
          courseId: null,
        },
        TEACHER_EMAIL,
      ),
    );

    expect(response.status).toBe("DRAFT");

    const quiz = (await testDb().collection("quizzes").doc(response.quizId).get()).data()!;
    expect(quiz.status).toBe("DRAFT");
    expect(quiz.deletedAt).toBeNull();
    expect(quiz.archivedAt).toBeNull();
  });

  it("교사가 아닌 계정은 거부한다", async () => {
    await expect(
      upsertQuiz.run(
        makeRequest(
          {
            subjectName: "컴퓨터프로그래밍심화",
            title: "중간고사",
            description: "",
            startAt: Date.now(),
            endAt: Date.now() + 60_000,
            accessCode: "ABC123",
            maxRunsPerProblem: 5,
            courseId: null,
          },
          "student1@hoseo.edu",
        ),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("기존 퀴즈 수정 시 status는 그대로 유지된다", async () => {
    const created = await upsertQuiz.run(
      makeRequest(
        {
          subjectName: "컴퓨터프로그래밍심화",
          title: "중간고사",
          description: "",
          startAt: Date.now(),
          endAt: Date.now() + 60_000,
          accessCode: "ABC123",
          maxRunsPerProblem: 5,
          courseId: null,
        },
        TEACHER_EMAIL,
      ),
    );
    await testDb().collection("quizzes").doc(created.quizId).update({ status: "OPEN" });

    const updated = await upsertQuiz.run(
      makeRequest(
        {
          quizId: created.quizId,
          subjectName: "컴퓨터프로그래밍심화",
          title: "중간고사 (수정)",
          description: "",
          startAt: Date.now(),
          endAt: Date.now() + 60_000,
          accessCode: "ABC123",
          maxRunsPerProblem: 5,
          courseId: null,
        },
        TEACHER_EMAIL,
      ),
    );

    expect(updated.status).toBe("OPEN");
    const quiz = (await testDb().collection("quizzes").doc(created.quizId).get()).data()!;
    expect(quiz.title).toBe("중간고사 (수정)");
    expect(quiz.status).toBe("OPEN");
  });
});
