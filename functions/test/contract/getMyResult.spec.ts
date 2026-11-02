import { afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { getMyResult } from "../../src/callable/getMyResult";
import type { TestCaseResult } from "../../src/models/types";

const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";

async function seedStudentAndProblem(quizOverrides: Record<string, unknown> = {}) {
  const db = testDb();
  await db.collection("students").doc(STUDENT_ID).set({
    name: "홍길동",
    email: STUDENT_EMAIL,
    status: "ACTIVE",
  });
  await db
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
      title: "중간고사",
      description: "",
      startAt: Timestamp.fromMillis(Date.now() - 60_000),
      endAt: Timestamp.fromMillis(Date.now() + 60_000),
      accessCode: "ABC123",
      status: "OPEN",
      maxRunsTotal: 5,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
      timerDurationMs: 30 * 60 * 1000,
      pausedAt: null,
      revealTestCases: false,
      ...quizOverrides,
    });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).set({
    order: 0,
    title: "문제1",
    description: "",
    initialCode: "",
    pointsTotal: 100,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  await db
    .collection("quizzes")
    .doc(QUIZ_ID)
    .collection("problemSecrets")
    .doc(PROBLEM_ID)
    .set({
      items: [
        {
          tcId: "tc1",
          tcNo: 1,
          input: "1",
          expected: "1",
          points: 60,
          isPublic: true,
          description: "",
        },
        {
          tcId: "tc2",
          tcNo: 2,
          input: "2",
          expected: "2",
          points: 40,
          isPublic: false,
          description: "",
        },
      ],
      updatedAt: FieldValue.serverTimestamp(),
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
                tcResults: [
                  {
                    tcId: "tc1",
                    passed: true,
                    isPublic: true,
                    points: 60,
                    input: "1",
                    expectedOutput: "1",
                    actualOutput: "1",
                  },
                  { tcId: "tc2", passed: false, isPublic: false, points: 40 },
                ],
              },
            }
          : {},
    });
}

describe("getMyResult", () => {
  afterAll(async () => {
    await teardownTestApp();
  });

  it("응시 중(IN_PROGRESS)에는 상태만 반환하고 테스트케이스를 공개하지 않는다", async () => {
    await clearFirestore();
    await seedStudentAndProblem();
    await seedParticipant("IN_PROGRESS");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    expect(response).toEqual({ participantStatus: "IN_PROGRESS" });
  });

  it("최종 제출 후 채점 전(SUBMITTED)에는 점수 없이 모든 테스트케이스의 입력·기대 출력을 반환한다", async () => {
    await clearFirestore();
    await seedStudentAndProblem({ status: "OPEN", revealTestCases: true });
    await seedParticipant("SUBMITTED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    expect(response.participantStatus).toBe("SUBMITTED");
    expect(response).not.toHaveProperty("finalTotal");
    expect(response).not.toHaveProperty("perProblem");
    expect(response.testCases).toEqual([
      {
        problemId: PROBLEM_ID,
        testCases: [
          { tcId: "tc1", isPublic: true, points: 60, input: "1", expectedOutput: "1" },
          { tcId: "tc2", isPublic: false, points: 40, input: "2", expectedOutput: "2" },
        ],
      },
    ]);
  });

  it("SUBMITTED여도 교사가 공개를 꺼두면 테스트케이스를 반환하지 않는다", async () => {
    await clearFirestore();
    await seedStudentAndProblem({ revealTestCases: false });
    await seedParticipant("SUBMITTED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    expect(response).toEqual({ participantStatus: "SUBMITTED" });
  });

  it("FINALIZED 이후에는 점수와 문항별 결과를 반환한다(공개를 끈 퀴즈는 비공개 항목 마스킹 유지)", async () => {
    await clearFirestore();
    await seedStudentAndProblem({ revealTestCases: false });
    await seedParticipant("FINALIZED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    expect(response.participantStatus).toBe("FINALIZED");
    expect(response.finalTotal).toBe(80);
    expect(response.maxTotal).toBe(100);
    expect(response.perProblem).toEqual([
      {
        problemId: PROBLEM_ID,
        status: "WA",
        score: 80,
        maxScore: 100,
        tcResults: [
          {
            tcId: "tc1",
            passed: true,
            isPublic: true,
            points: 60,
            input: "1",
            expectedOutput: "1",
            actualOutput: "1",
          },
          { tcId: "tc2", passed: false, isPublic: false, points: 40 },
        ],
      },
    ]);
  });

  it("입장한 적 없는 퀴즈를 조회하면 NOT_ENTERED로 거부한다", async () => {
    await clearFirestore();
    await seedStudentAndProblem();
    await expect(
      getMyResult.run(makeRequest({ quizId: "never-entered-quiz" }, STUDENT_EMAIL)),
    ).rejects.toMatchObject({ details: { code: "NOT_ENTERED" } });
  });

  it("공개 토글이 꺼져 있으면 퀴즈가 CLOSED여도 비공개 항목은 그대로 마스킹된다", async () => {
    await clearFirestore();
    await seedStudentAndProblem({ status: "CLOSED", revealTestCases: false });
    await seedParticipant("FINALIZED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    const tc2 = response.perProblem![0]!.tcResults.find((tc: TestCaseResult) => tc.tcId === "tc2")!;
    expect(tc2).toEqual({ tcId: "tc2", passed: false, isPublic: false, points: 40 });
  });

  it("퀴즈가 아직 OPEN이어도 본인이 제출을 마쳤고 공개가 켜져 있으면 비공개 항목이 공개된다", async () => {
    await clearFirestore();
    await seedStudentAndProblem({ status: "OPEN", revealTestCases: true });
    await seedParticipant("FINALIZED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    const tc2 = response.perProblem![0]!.tcResults.find((tc: TestCaseResult) => tc.tcId === "tc2")!;
    expect(tc2).toMatchObject({ input: "2", expectedOutput: "2" });
  });

  it("revealTestCases 필드가 없는 기존 퀴즈도 공개된 것으로 본다", async () => {
    await clearFirestore();
    await seedStudentAndProblem();
    await testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .update({ revealTestCases: FieldValue.delete() });
    await seedParticipant("FINALIZED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    const tc2 = response.perProblem![0]!.tcResults.find((tc: TestCaseResult) => tc.tcId === "tc2")!;
    expect(tc2).toMatchObject({ input: "2", expectedOutput: "2" });
  });

  it("퀴즈가 CLOSED고 공개 토글이 켜져 있으면 비공개 항목의 input/expected가 채워진다(actual은 없음)", async () => {
    await clearFirestore();
    await seedStudentAndProblem({ status: "CLOSED", revealTestCases: true });
    await seedParticipant("FINALIZED");

    const response = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));

    const [tc1, tc2] = response.perProblem![0]!.tcResults;
    // 원래 공개였던 항목은 그대로.
    expect(tc1).toEqual({
      tcId: "tc1",
      passed: true,
      isPublic: true,
      points: 60,
      input: "1",
      expectedOutput: "1",
      actualOutput: "1",
    });
    // 원래 비공개였던 항목은 input/expectedOutput만 되살아나고 actualOutput은 없다.
    expect(tc2).toEqual({
      tcId: "tc2",
      passed: false,
      isPublic: false,
      points: 40,
      input: "2",
      expectedOutput: "2",
    });
  });
});
