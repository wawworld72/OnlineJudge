import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";
import { upsertTestCase, deleteTestCase } from "../../src/callable/testCases";

const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";

async function seedEmptyProblem() {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).set({
    order: 0,
    title: "문제1",
    description: "",
    initialCode: "",
    maxRuns: null,
    pointsTotal: 0,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problemSecrets").doc(PROBLEM_ID).set({
    items: [],
    updatedAt: FieldValue.serverTimestamp(),
  });
}

describe("upsertTestCase / deleteTestCase", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedEmptyProblem();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("테스트케이스를 추가하면 problemSecrets.items와 problems.pointsTotal이 같은 트랜잭션으로 갱신된다", async () => {
    await upsertTestCase.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        problemId: PROBLEM_ID,
        testCase: {
          tcNo: 1,
          input: "1",
          expected: "1",
          points: 60,
          isPublic: true,
          description: "",
        },
      }),
    );

    const secrets = (
      await testDb()
        .collection("quizzes")
        .doc(QUIZ_ID)
        .collection("problemSecrets")
        .doc(PROBLEM_ID)
        .get()
    ).data()!;
    expect(secrets.items).toHaveLength(1);

    const problem = (
      await testDb().collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).get()
    ).data()!;
    expect(problem.pointsTotal).toBe(60);
    expect(problem.updatedAt.isEqual(secrets.updatedAt)).toBe(true);
  });

  it("tcId를 지정하면 기존 테스트케이스를 치환한다", async () => {
    const created = await upsertTestCase.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        problemId: PROBLEM_ID,
        testCase: {
          tcNo: 1,
          input: "1",
          expected: "1",
          points: 60,
          isPublic: true,
          description: "",
        },
      }),
    );

    await upsertTestCase.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        problemId: PROBLEM_ID,
        testCase: {
          tcId: created.tcId,
          tcNo: 1,
          input: "1",
          expected: "1",
          points: 90,
          isPublic: true,
          description: "수정됨",
        },
      }),
    );

    const secrets = (
      await testDb()
        .collection("quizzes")
        .doc(QUIZ_ID)
        .collection("problemSecrets")
        .doc(PROBLEM_ID)
        .get()
    ).data()!;
    expect(secrets.items).toHaveLength(1);
    expect(secrets.items[0].points).toBe(90);
  });

  it("deleteTestCase는 해당 항목만 제거하고 배점 합을 다시 계산한다", async () => {
    const first = await upsertTestCase.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        problemId: PROBLEM_ID,
        testCase: {
          tcNo: 1,
          input: "1",
          expected: "1",
          points: 60,
          isPublic: true,
          description: "",
        },
      }),
    );
    await upsertTestCase.run(
      makeTeacherRequest({
        quizId: QUIZ_ID,
        problemId: PROBLEM_ID,
        testCase: {
          tcNo: 2,
          input: "2",
          expected: "2",
          points: 40,
          isPublic: false,
          description: "",
        },
      }),
    );

    await deleteTestCase.run(
      makeTeacherRequest({ quizId: QUIZ_ID, problemId: PROBLEM_ID, tcId: first.tcId }),
    );

    const secrets = (
      await testDb()
        .collection("quizzes")
        .doc(QUIZ_ID)
        .collection("problemSecrets")
        .doc(PROBLEM_ID)
        .get()
    ).data()!;
    expect(secrets.items).toHaveLength(1);

    const problem = (
      await testDb().collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).get()
    ).data()!;
    expect(problem.pointsTotal).toBe(40);
  });

  it("같은 문항의 서로 다른 테스트케이스를 동시에 추가해도 두 수정 모두 최종 배점에 반영된다", async () => {
    await Promise.all([
      upsertTestCase.run(
        makeTeacherRequest({
          quizId: QUIZ_ID,
          problemId: PROBLEM_ID,
          testCase: {
            tcNo: 1,
            input: "1",
            expected: "1",
            points: 30,
            isPublic: true,
            description: "",
          },
        }),
      ),
      upsertTestCase.run(
        makeTeacherRequest({
          quizId: QUIZ_ID,
          problemId: PROBLEM_ID,
          testCase: {
            tcNo: 2,
            input: "2",
            expected: "2",
            points: 70,
            isPublic: false,
            description: "",
          },
        }),
      ),
    ]);

    const secrets = (
      await testDb()
        .collection("quizzes")
        .doc(QUIZ_ID)
        .collection("problemSecrets")
        .doc(PROBLEM_ID)
        .get()
    ).data()!;
    expect(secrets.items).toHaveLength(2);

    const problem = (
      await testDb().collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).get()
    ).data()!;
    expect(problem.pointsTotal).toBe(100);
  });
});
