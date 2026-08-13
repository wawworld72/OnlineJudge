import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { batchGrade } from "../../src/callable/batchGrade";

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";

async function seedQuiz() {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).set({
    title: "중간고사",
    description: "",
    startAt: ts(-60_000),
    endAt: ts(-1_000),
    accessCode: "ABC123",
    status: "CLOSED",
    maxRunsPerProblem: 5,
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
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problemSecrets").doc(PROBLEM_ID).set({
    items: [{ tcId: "tc1", tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true, description: "" }],
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function seedParticipant(studentId: string, finalStatus: "SUBMITTED" | "IN_PROGRESS" | "FINALIZED") {
  await testDb()
    .collection("participants")
    .doc(`${QUIZ_ID}_${studentId}`)
    .set({
      quizId: QUIZ_ID,
      studentId,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus,
      finalSubmittedAt: finalStatus === "IN_PROGRESS" ? null : FieldValue.serverTimestamp(),
      finalTotal: finalStatus === "FINALIZED" ? 100 : 0,
      runsUsedByProblem: {},
      submissions:
        finalStatus === "IN_PROGRESS" ? {} : { [PROBLEM_ID]: { code: "int main(){}", submittedAt: Timestamp.now() } },
      runResults:
        finalStatus === "FINALIZED"
          ? { [PROBLEM_ID]: { status: "AC", score: 100, maxScore: 100, compileErrorMessage: null, tcResults: [] } }
          : {},
      gradePushedAt: null,
    });
}

describe("일괄 채점: 제출완료/미제출/이미확정 참가자가 섞인 퀴즈", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("제출완료 참가자만 처리하고, 미제출은 대상에서 빠지며, 이미확정은 스킵으로 집계한다", async () => {
    await seedQuiz();
    await seedParticipant("submitted-student", "SUBMITTED");
    await seedParticipant("in-progress-student", "IN_PROGRESS");
    await seedParticipant("finalized-student", "FINALIZED");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        status: "JUDGED",
        score: 100,
        maxScore: 100,
        compileErrorMessage: null,
        tcResultsFull: [{ result: "✅PASS", earned: 100, isPublic: false, input: "1", expected: "1", actual: "1", memo: "" }],
      }),
    } as Response);

    const response = await batchGrade.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect(response.processed).toBe(1);
    expect(response.skipped).toBe(1);
    expect(response.failed).toBe(0);

    const submitted = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_submitted-student`).get()
    ).data()!;
    expect(submitted.finalStatus).toBe("FINALIZED");
    expect(submitted.finalTotal).toBe(100);

    const inProgress = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_in-progress-student`).get()
    ).data()!;
    expect(inProgress.finalStatus).toBe("IN_PROGRESS");
  });
});
