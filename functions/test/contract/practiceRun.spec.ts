import { beforeEach, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { practiceRun } from "../../src/callable/practiceRun";
import type { TestCaseResult } from "../../src/models/types";

const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";

function mockGraderResponse(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

async function seedQuizAndProblem() {
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
        { tcId: "tc1", tcNo: 1, input: "1", expected: "1", points: 60, isPublic: true, description: "" },
        { tcId: "tc2", tcNo: 2, input: "2", expected: "2", points: 40, isPublic: false, description: "" },
      ],
      updatedAt: ts(0),
    });
  await db.collection("students").doc(STUDENT_ID).set({
    name: "홍길동",
    email: STUDENT_EMAIL,
    status: "ACTIVE",
  });
  await db
    .collection("participants")
    .doc(`${QUIZ_ID}_${STUDENT_ID}`)
    .set({
      quizId: QUIZ_ID,
      studentId: STUDENT_ID,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus: "IN_PROGRESS",
      finalSubmittedAt: null,
      finalTotal: 0,
      completedCount: 0,
      totalCount: 1,
      runsUsedByProblem: {},
      submissions: {},
      runResults: {},
    });
}

describe("practiceRun", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedQuizAndProblem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("정답이면 AC, 비공개 테스트케이스는 마스킹해 전달한다", async () => {
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 100,
      maxScore: 100,
      compileErrorMessage: null,
      tcResultsFull: [
        { result: "✅PASS", earned: 60, isPublic: false, input: "1", expected: "1", actual: "1", memo: "" },
        { result: "✅PASS", earned: 40, isPublic: false, input: "2", expected: "2", actual: "2", memo: "" },
      ],
    });

    const response = await practiceRun.run(
      makeRequest({ quizId: QUIZ_ID, problemId: PROBLEM_ID, code: "int main(){}" }, STUDENT_EMAIL),
    );

    expect(response.status).toBe("AC");
    expect(response.score).toBe(100);
    expect(response.usedCache).toBe(false);
    expect(response.remainingRuns).toBe(2);
    const tcResults = response.tcResults as TestCaseResult[];
    const privateResult = tcResults.find((r) => r.tcId === "tc2")!;
    expect(privateResult.input).toBeUndefined();
    expect(privateResult.actualOutput).toBeUndefined();
    const publicResult = tcResults.find((r) => r.tcId === "tc1")!;
    expect(publicResult.input).toBe("1");
  });

  it("실행 횟수를 모두 사용하면 NO_RUNS_LEFT로 거부한다", async () => {
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 0,
      maxScore: 100,
      compileErrorMessage: null,
      tcResultsFull: [
        { result: "❌FAIL", earned: 0, isPublic: false, input: "1", expected: "1", actual: "x", memo: "" },
        { result: "❌FAIL", earned: 0, isPublic: false, input: "2", expected: "2", actual: "x", memo: "" },
      ],
    });

    const request = makeRequest(
      { quizId: QUIZ_ID, problemId: PROBLEM_ID, code: "int main(){}" },
      STUDENT_EMAIL,
    );
    await practiceRun.run(request);
    await practiceRun.run({ ...request, data: { ...request.data, code: "different code" } });
    await practiceRun.run({ ...request, data: { ...request.data, code: "yet another code" } });

    await expect(
      practiceRun.run({ ...request, data: { ...request.data, code: "one more code" } }),
    ).rejects.toMatchObject({ details: { code: "NO_RUNS_LEFT" } });
  });

  it("같은 코드로 재실행하면 캐시를 재사용하고 실행 횟수를 차감하지 않는다", async () => {
    const fetchSpy = mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 60,
      maxScore: 100,
      compileErrorMessage: null,
      tcResultsFull: [
        { result: "✅PASS", earned: 60, isPublic: false, input: "1", expected: "1", actual: "1", memo: "" },
        { result: "❌FAIL", earned: 0, isPublic: false, input: "2", expected: "2", actual: "x", memo: "" },
      ],
    });

    const request = makeRequest(
      { quizId: QUIZ_ID, problemId: PROBLEM_ID, code: "int main(){}" },
      STUDENT_EMAIL,
    );
    const first = await practiceRun.run(request);
    const second = await practiceRun.run(request);

    expect(first.usedCache).toBe(false);
    expect(second.usedCache).toBe(true);
    expect(second.remainingRuns).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("동시 호출이 몰려도 실행 횟수 한도를 넘지 않는다", async () => {
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 0,
      maxScore: 100,
      compileErrorMessage: null,
      tcResultsFull: [
        { result: "❌FAIL", earned: 0, isPublic: false, input: "1", expected: "1", actual: "x", memo: "" },
        { result: "❌FAIL", earned: 0, isPublic: false, input: "2", expected: "2", actual: "x", memo: "" },
      ],
    });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        practiceRun.run(
          makeRequest(
            { quizId: QUIZ_ID, problemId: PROBLEM_ID, code: `code-${i}` },
            STUDENT_EMAIL,
          ),
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(3);

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`).get()
    ).data()!;
    expect(participant.runsUsedByProblem[PROBLEM_ID]).toBe(3);
  });
});
