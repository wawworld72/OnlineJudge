import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { getMyResult } from "../../src/callable/getMyResult";

const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";

async function seedStudentAndProblem() {
  const db = testDb();
  await db.collection("students").doc(STUDENT_ID).set({
    name: "홍길동",
    email: STUDENT_EMAIL,
    status: "ACTIVE",
  });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).set({
    order: 0,
    title: "문제1",
    description: "",
    initialCode: "",
    maxRuns: null,
    pointsTotal: 100,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
}

async function seedParticipant(finalStatus: "IN_PROGRESS" | "SUBMITTED" | "FINALIZED") {
  await testDb()
    .collection("participants")
    .doc(`${QUIZ_ID}_${STUDENT_ID}`)
    .set({
      quizId: QUIZ_ID,
      studentId: STUDENT_ID,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus,
      finalSubmittedAt: finalStatus === "IN_PROGRESS" ? null : FieldValue.serverTimestamp(),
      finalTotal: finalStatus === "FINALIZED" ? 80 : 0,
      completedCount: 1,
      totalCount: 1,
      runsUsedByProblem: {},
      submissions: {},
      runResults:
        finalStatus === "FINALIZED"
          ? {
              [PROBLEM_ID]: {
                status: "WA",
                score: 80,
                maxScore: 100,
                compileErrorMessage: null,
                tcResults: [{ tcId: "tc1", passed: true, isPublic: true }],
              },
            }
          : {},
    });
}

describe("getMyResult", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedStudentAndProblem();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("FINALIZED 이전에는 점수 없이 상태만 반환한다", async () => {
    await seedParticipant("SUBMITTED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    expect(response.participantStatus).toBe("SUBMITTED");
    expect(response).not.toHaveProperty("finalTotal");
    expect(response).not.toHaveProperty("perProblem");
  });

  it("FINALIZED 이후에는 점수와 문항별 결과를 반환한다", async () => {
    await seedParticipant("FINALIZED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    expect(response.participantStatus).toBe("FINALIZED");
    expect(response.finalTotal).toBe(80);
    expect(response.maxTotal).toBe(100);
    expect(response.perProblem).toEqual([
      { problemId: PROBLEM_ID, status: "WA", score: 80, maxScore: 100, tcResults: [{ tcId: "tc1", passed: true, isPublic: true }] },
    ]);
  });

  it("입장한 적 없는 퀴즈를 조회하면 NOT_ENTERED로 거부한다", async () => {
    await expect(
      getMyResult.run(makeRequest({ quizId: "never-entered-quiz" }, STUDENT_EMAIL)),
    ).rejects.toMatchObject({ details: { code: "NOT_ENTERED" } });
  });
});
