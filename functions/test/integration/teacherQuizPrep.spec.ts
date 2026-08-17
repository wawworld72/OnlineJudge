import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { upsertQuiz } from "../../src/callable/upsertQuiz";
import { upsertProblem } from "../../src/callable/problems";
import { upsertTestCase } from "../../src/callable/testCases";
import { runPreDeployCheck } from "../../src/callable/runPreDeployCheck";
import { setQuizStatus } from "../../src/callable/setQuizStatus";

const TEACHER_EMAIL = "teacher@hoseo.edu";

describe("교사의 퀴즈 준비 흐름 (생성 → 문항/테스트케이스 입력 → 배포 전 점검 → 공개 전환)", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("퀴즈를 만들고 문항·테스트케이스를 채운 뒤 점검을 통과시켜 공개 상태로 전환한다", async () => {
    const quiz = await upsertQuiz.run(
      makeRequest(
        {
          subjectName: "컴퓨터프로그래밍심화",
          title: "중간고사",
          description: "",
          startAt: Date.now(),
          endAt: Date.now() + 60 * 60 * 1000,
          accessCode: "ABC123",
          maxRunsPerProblem: 5,
          courseId: null,
        },
        TEACHER_EMAIL,
      ),
    );
    expect(quiz.status).toBe("DRAFT");

    const problem = await upsertProblem.run(
      makeRequest(
        {
          quizId: quiz.quizId,
          order: 0,
          title: "문제1",
          description: "설명",
          initialCode: "",
          maxRuns: null,
        },
        TEACHER_EMAIL,
      ),
    );

    await upsertTestCase.run(
      makeRequest(
        {
          quizId: quiz.quizId,
          problemId: problem.problemId,
          testCase: { tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true, description: "" },
        },
        TEACHER_EMAIL,
      ),
    );

    const check = await runPreDeployCheck.run(makeRequest({ quizId: quiz.quizId }, TEACHER_EMAIL));
    expect(check.blockingCount).toBe(0);

    const opened = await setQuizStatus.run(
      makeRequest({ quizId: quiz.quizId, status: "OPEN" }, TEACHER_EMAIL),
    );
    expect(opened.status).toBe("OPEN");

    const savedQuiz = (await testDb().collection("quizzes").doc(quiz.quizId).get()).data()!;
    expect(savedQuiz.status).toBe("OPEN");
  });
});
