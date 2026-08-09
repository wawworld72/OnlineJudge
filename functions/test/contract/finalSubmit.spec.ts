import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { finalSubmit } from "../../src/callable/finalSubmit";

const QUIZ_ID = "quiz-1";
const PROBLEM_ID = "p1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";

async function seedQuiz(endAtMs: number, status: "OPEN" | "CLOSED" = "OPEN") {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).set({
    title: "중간고사",
    description: "",
    startAt: ts(-60_000),
    endAt: ts(endAtMs),
    accessCode: "ABC123",
    status,
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

describe("finalSubmit", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("문항별 코드를 submissions map에 한 번에 기록하고 SUBMITTED로 전환한다", async () => {
    await seedQuiz(60_000);

    const response = await finalSubmit.run(
      makeRequest(
        { quizId: QUIZ_ID, submissions: [{ problemId: PROBLEM_ID, code: "int main(){}" }] },
        STUDENT_EMAIL,
      ),
    );

    expect(response.participantStatus).toBe("SUBMITTED");
    expect(response.finalSubmittedAt).not.toBeNull();

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`).get()
    ).data()!;
    expect(participant.finalStatus).toBe("SUBMITTED");
    expect(participant.submissions[PROBLEM_ID].code).toBe("int main(){}");
  });

  it("이미 제출한 뒤 다시 호출하면 기존 결과를 그대로 반환한다", async () => {
    await seedQuiz(60_000);
    const request = makeRequest(
      { quizId: QUIZ_ID, submissions: [{ problemId: PROBLEM_ID, code: "first" }] },
      STUDENT_EMAIL,
    );
    const first = await finalSubmit.run(request);

    const second = await finalSubmit.run(
      makeRequest(
        { quizId: QUIZ_ID, submissions: [{ problemId: PROBLEM_ID, code: "second" }] },
        STUDENT_EMAIL,
      ),
    );

    expect(second.participantStatus).toBe("SUBMITTED");
    expect(second.finalSubmittedAt).toBe(first.finalSubmittedAt);

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`).get()
    ).data()!;
    expect(participant.submissions[PROBLEM_ID].code).toBe("first");
  });

  it("종료 시각 이후 제출을 시도하면 QUIZ_CLOSED로 거부한다", async () => {
    await seedQuiz(-1_000);

    await expect(
      finalSubmit.run(
        makeRequest(
          { quizId: QUIZ_ID, submissions: [{ problemId: PROBLEM_ID, code: "too late" }] },
          STUDENT_EMAIL,
        ),
      ),
    ).rejects.toMatchObject({ details: { code: "QUIZ_CLOSED" } });
  });

  it("퀴즈에 속하지 않은 problemId는 무시하고 채택하지 않는다", async () => {
    await seedQuiz(60_000);

    await finalSubmit.run(
      makeRequest(
        {
          quizId: QUIZ_ID,
          submissions: [
            { problemId: PROBLEM_ID, code: "real" },
            { problemId: "not-a-real-problem", code: "fake" },
          ],
        },
        STUDENT_EMAIL,
      ),
    );

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`).get()
    ).data()!;
    expect(Object.keys(participant.submissions)).toEqual([PROBLEM_ID]);
  });
});
