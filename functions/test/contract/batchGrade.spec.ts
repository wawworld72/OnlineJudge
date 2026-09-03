import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { batchGrade } from "../../src/callable/batchGrade";

const QUIZ_ID = "quiz-1";
const P1 = "p1";
const P2 = "p2";

function mockGraderResponse(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

async function seedQuizWithTwoProblems(courseId: string | null = null) {
  const db = testDb();
  await db
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
      title: "중간고사",
      description: "",
      startAt: ts(-60_000),
      endAt: ts(-1_000),
      accessCode: "ABC123",
      status: "CLOSED",
      maxRunsPerProblem: 5,
      courseId,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
    });
  for (const [problemId, points] of [
    [P1, 60],
    [P2, 40],
  ] as const) {
    await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc(problemId).set({
      order: 0,
      title: problemId,
      description: "",
      initialCode: "",
      maxRuns: null,
      pointsTotal: points,
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });
    await db
      .collection("quizzes")
      .doc(QUIZ_ID)
      .collection("problemSecrets")
      .doc(problemId)
      .set({
        items: [
          {
            tcId: "tc1",
            tcNo: 1,
            input: "1",
            expected: "1",
            points,
            isPublic: true,
            description: "",
          },
        ],
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
}

async function seedParticipant(studentId: string, overrides: Record<string, unknown> = {}) {
  await testDb()
    .collection("participants")
    .doc(`${QUIZ_ID}_${studentId}`)
    .set({
      quizId: QUIZ_ID,
      studentId,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus: "SUBMITTED",
      finalSubmittedAt: FieldValue.serverTimestamp(),
      finalTotal: 0,
      runsUsedByProblem: {},
      submissions: { [P1]: { code: "int main(){}", submittedAt: Timestamp.now() } },
      runResults: {},
      gradePushedAt: null,
      ...overrides,
    });
}

describe("batchGrade", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("제출완료 참가자를 채점하고, 미제출 문항은 NOT_ATTEMPTED 0점으로 처리한다", async () => {
    await seedQuizWithTwoProblems();
    await seedParticipant("20240001");
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 60,
      maxScore: 60,
      compileErrorMessage: null,
      tcResultsFull: [
        {
          result: "✅PASS",
          earned: 1,
          isPublic: false,
          input: "1",
          expected: "1",
          actual: "1",
          memo: "",
        },
      ],
    });

    const response = await batchGrade.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.processed).toBe(1);
    expect(response.failed).toBe(0);

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_20240001`).get()
    ).data()!;
    expect(participant.finalStatus).toBe("FINALIZED");
    expect(participant.runResults[P1].status).toBe("AC");
    expect(participant.runResults[P2].status).toBe("NOT_ATTEMPTED");
    expect(participant.runResults[P2].score).toBe(0);
    expect(participant.finalTotal).toBe(60);
  });

  it("이미 확정된 참가자는 다시 채점하지 않고 스킵으로 집계한다", async () => {
    await seedQuizWithTwoProblems();
    await seedParticipant("20240001", {
      finalStatus: "FINALIZED",
      finalTotal: 100,
      runResults: {
        [P1]: { status: "AC", score: 60, maxScore: 60, compileErrorMessage: null, tcResults: [] },
        [P2]: { status: "AC", score: 40, maxScore: 40, compileErrorMessage: null, tcResults: [] },
      },
    });
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 0,
      maxScore: 60,
      compileErrorMessage: null,
      tcResultsFull: [],
    });

    const response = await batchGrade.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.processed).toBe(0);
    expect(response.skipped).toBe(1);

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_20240001`).get()
    ).data()!;
    expect(participant.finalTotal).toBe(100);
  });

  it("Grader 호출이 계속 실패하는 참가자는 failed로 집계하고 SUBMITTED 상태를 유지한다", async () => {
    await seedQuizWithTwoProblems();
    await seedParticipant("20240001");
    mockGraderResponse({ ok: false, error: "internal error" });

    const response = await batchGrade.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.processed).toBe(0);
    expect(response.failed).toBe(1);
    expect(response.failedParticipantIds).toEqual(["20240001"]);

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_20240001`).get()
    ).data()!;
    expect(participant.finalStatus).toBe("SUBMITTED");
  });

  it("분반이 연동되어 있고 아직 반영 안 된 확정 참가자가 있으면 classroomGradesPending을 true로 반환한다", async () => {
    await seedQuizWithTwoProblems("course-1");
    await seedParticipant("20240001");
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 60,
      maxScore: 60,
      compileErrorMessage: null,
      tcResultsFull: [
        {
          result: "✅PASS",
          earned: 1,
          isPublic: false,
          input: "1",
          expected: "1",
          actual: "1",
          memo: "",
        },
      ],
    });

    const response = await batchGrade.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.classroomGradesPending).toBe(true);
  });

  it("테스트용 수강생 참가자(isTestEntry)는 일괄 채점 대상·집계에서 제외된다", async () => {
    await seedQuizWithTwoProblems();
    await seedParticipant("20240001");
    await seedParticipant("test001", { isTestEntry: true });
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 60,
      maxScore: 60,
      compileErrorMessage: null,
      tcResultsFull: [
        {
          result: "✅PASS",
          earned: 1,
          isPublic: false,
          input: "1",
          expected: "1",
          actual: "1",
          memo: "",
        },
      ],
    });

    const response = await batchGrade.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.processed).toBe(1);
    expect(response.skipped).toBe(0);
    expect(response.failed).toBe(0);

    const testParticipant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_test001`).get()
    ).data()!;
    expect(testParticipant.finalStatus).toBe("SUBMITTED");
  });

  it("분반이 연동되지 않으면 classroomGradesPending은 항상 false다", async () => {
    await seedQuizWithTwoProblems(null);
    await seedParticipant("20240001");
    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 60,
      maxScore: 60,
      compileErrorMessage: null,
      tcResultsFull: [
        {
          result: "✅PASS",
          earned: 1,
          isPublic: false,
          input: "1",
          expected: "1",
          actual: "1",
          memo: "",
        },
      ],
    });

    const response = await batchGrade.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.classroomGradesPending).toBe(false);
  });
});
