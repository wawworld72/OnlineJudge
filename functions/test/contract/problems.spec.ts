import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";
import { upsertProblem, deleteProblem } from "../../src/callable/problems";

const QUIZ_ID = "quiz-1";

describe("upsertProblem / deleteProblem", () => {
  beforeEach(async () => {
    await clearFirestore();
    await testDb().collection("quizzes").doc(QUIZ_ID).set({ title: "퀴즈" });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("신규 문항 생성 시 pointsTotal을 0으로 초기화하고 problemSecrets를 함께 만든다", async () => {
    const response = await upsertProblem.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        order: 0,
        title: "문제1",
        description: "설명",
        initialCode: "",
        maxRuns: null,
      }),
    );

    expect(response.pointsTotal).toBe(0);

    const problem = (
      await testDb()
        .collection("quizzes")
        .doc(QUIZ_ID)
        .collection("problems")
        .doc(response.problemId)
        .get()
    ).data()!;
    expect(problem.pointsTotal).toBe(0);
    expect(problem.deletedAt).toBeNull();

    const secrets = (
      await testDb()
        .collection("quizzes")
        .doc(QUIZ_ID)
        .collection("problemSecrets")
        .doc(response.problemId)
        .get()
    ).data()!;
    expect(secrets.items).toEqual([]);
  });

  it("메타데이터만 수정하면 pointsTotal/updatedAt은 변하지 않는다", async () => {
    const created = await upsertProblem.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        order: 0,
        title: "문제1",
        description: "",
        initialCode: "",
        maxRuns: null,
      }),
    );
    const problemRef = testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .collection("problems")
      .doc(created.problemId);
    await problemRef.update({ pointsTotal: 60 });
    const before = (await problemRef.get()).data()!;

    await upsertProblem.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        problemId: created.problemId,
        order: 0,
        title: "문제1 (수정)",
        description: "",
        initialCode: "",
        maxRuns: null,
      }),
    );

    const after = (await problemRef.get()).data()!;
    expect(after.title).toBe("문제1 (수정)");
    expect(after.pointsTotal).toBe(60);
    expect(after.updatedAt.isEqual(before.updatedAt)).toBe(true);
  });

  it("deleteProblem은 문서를 지우지 않고 deletedAt만 설정한다", async () => {
    const created = await upsertProblem.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        order: 0,
        title: "문제1",
        description: "",
        initialCode: "",
        maxRuns: null,
      }),
    );

    await deleteProblem.run(makeTeacherRequest({ quizId: QUIZ_ID, problemId: created.problemId }));

    const problemSnap = await testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .collection("problems")
      .doc(created.problemId)
      .get();
    expect(problemSnap.exists).toBe(true);
    expect(problemSnap.data()!.deletedAt).not.toBeNull();
  });
});
