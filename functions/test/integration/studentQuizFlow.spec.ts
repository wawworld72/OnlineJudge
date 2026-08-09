import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { enterQuiz } from "../../src/callable/enterQuiz";
import { practiceRun } from "../../src/callable/practiceRun";
import { finalSubmit } from "../../src/callable/finalSubmit";
import { getMyResult } from "../../src/callable/getMyResult";

const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";

function mockGraderResponse(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

async function seedOpenQuizWithProblem() {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).set({
    title: "중간고사",
    description: "",
    startAt: ts(-60_000),
    endAt: ts(60_000),
    accessCode: "ABC123",
    status: "OPEN",
    maxRunsPerProblem: 3,
    courseId: null,
    courseWorkId: null,
    courseWorkLink: null,
    archivedAt: null,
    archiveSpreadsheetUrl: null,
    deletedAt: null,
  });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc(PROBLEM_ID).set({
    order: 0,
    title: "문제1",
    description: "",
    initialCode: "",
    maxRuns: null,
    pointsTotal: 100,
    updatedAt: ts(0),
    deletedAt: null,
  });
  await db
    .collection("quizzes")
    .doc(QUIZ_ID)
    .collection("problemSecrets")
    .doc(PROBLEM_ID)
    .set({
      items: [
        { tcId: "tc1", tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true, description: "" },
      ],
      updatedAt: ts(0),
    });
  await db.collection("students").doc(STUDENT_ID).set({
    name: "홍길동",
    email: STUDENT_EMAIL,
    status: "ACTIVE",
  });
}

describe("학생 응시 전체 흐름 (입장 → 연습 실행 → 최종 제출)", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedOpenQuizWithProblem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("입장 후 연습 실행(캐시 재사용 포함)을 거쳐 최종 제출까지 완료한다", async () => {
    const enterResponse = await enterQuiz.run(
      makeRequest(
        { quizId: QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
        STUDENT_EMAIL,
      ),
    );
    expect(enterResponse.participantStatus).toBe("IN_PROGRESS");
    expect(enterResponse.problems).toHaveLength(1);
    expect(enterResponse.problems[0]!.remainingRuns).toBe(3);

    const fetchSpy = mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 100,
      maxScore: 100,
      compileErrorMessage: null,
      tcResultsFull: [{ id: "tc1", passed: true, input: "1", expectedOutput: "1", actualOutput: "1" }],
    });

    const code = "int main(){ return 0; }";
    const firstRun = await practiceRun.run(
      makeRequest({ quizId: QUIZ_ID, problemId: PROBLEM_ID, code }, STUDENT_EMAIL),
    );
    expect(firstRun.usedCache).toBe(false);
    expect(firstRun.status).toBe("AC");
    expect(firstRun.remainingRuns).toBe(2);

    const secondRun = await practiceRun.run(
      makeRequest({ quizId: QUIZ_ID, problemId: PROBLEM_ID, code }, STUDENT_EMAIL),
    );
    expect(secondRun.usedCache).toBe(true);
    expect(secondRun.remainingRuns).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const submitResponse = await finalSubmit.run(
      makeRequest({ quizId: QUIZ_ID, submissions: [{ problemId: PROBLEM_ID, code }] }, STUDENT_EMAIL),
    );
    expect(submitResponse.participantStatus).toBe("SUBMITTED");

    const beforeGrading = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));
    expect(beforeGrading.participantStatus).toBe("SUBMITTED");
    expect(beforeGrading).not.toHaveProperty("finalTotal");

    await testDb()
      .collection("participants")
      .doc(`${QUIZ_ID}_${STUDENT_ID}`)
      .update({
        finalStatus: "FINALIZED",
        finalTotal: 100,
        [`runResults.${PROBLEM_ID}`]: {
          status: "AC",
          score: 100,
          maxScore: 100,
          compileErrorMessage: null,
          tcResults: [{ tcId: "tc1", passed: true, isPublic: true, input: "1", expectedOutput: "1", actualOutput: "1" }],
        },
      });

    const afterGrading = await getMyResult.run(makeRequest({ quizId: QUIZ_ID }, STUDENT_EMAIL));
    expect(afterGrading.participantStatus).toBe("FINALIZED");
    expect(afterGrading.finalTotal).toBe(100);
    expect(afterGrading.maxTotal).toBe(100);
  });
});
