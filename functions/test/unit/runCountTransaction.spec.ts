import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, teardownTestApp, testDb } from "../testEnv";
import { incrementRunCountOrThrow } from "../../src/services/runCountTransaction";

const QUIZ_ID = "quiz-1";
const STUDENT_ID = "20240001";
const PROBLEM_ID = "p1";

describe("incrementRunCountOrThrow", () => {
  beforeEach(async () => {
    await clearFirestore();
    await testDb()
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
        gradePushedAt: null,
      });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("한도 미만이면 1 증가시키고 새 카운트를 반환한다", async () => {
    const db = testDb();
    const ref = db.collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`);

    const first = await incrementRunCountOrThrow(db, ref, PROBLEM_ID, 3);
    expect(first).toBe(1);
    const second = await incrementRunCountOrThrow(db, ref, PROBLEM_ID, 3);
    expect(second).toBe(2);
  });

  it("한도에 도달하면 NO_RUNS_LEFT를 던진다", async () => {
    const db = testDb();
    const ref = db.collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`);

    await incrementRunCountOrThrow(db, ref, PROBLEM_ID, 1);
    await expect(incrementRunCountOrThrow(db, ref, PROBLEM_ID, 1)).rejects.toMatchObject({
      details: { code: "NO_RUNS_LEFT" },
    });
  });

  it("동시에 여러 요청이 들어와도 한도(FR-014)를 넘지 않는다", async () => {
    const db = testDb();
    const ref = db.collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`);
    const maxRuns = 5;

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => incrementRunCountOrThrow(db, ref, PROBLEM_ID, maxRuns)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(maxRuns);

    const participant = (await ref.get()).data()!;
    expect(participant.runsUsedByProblem[PROBLEM_ID]).toBe(maxRuns);
  });
});
