import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { enterQuiz } from "../../src/callable/enterQuiz";
import type { HttpsError } from "firebase-functions/v2/https";

const QUIZ_ID = "quiz-1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";

async function seedOpenQuiz() {
  const db = testDb();
  await db.collection("quizzes").doc(QUIZ_ID).set({
    title: "중간고사",
    description: "",
    startAt: ts(-60_000),
    endAt: ts(60_000),
    accessCode: "ABC123",
    status: "OPEN",
    maxRunsPerProblem: 5,
    courseId: null,
    courseWorkId: null,
    courseWorkLink: null,
    archivedAt: null,
    archiveSpreadsheetUrl: null,
    deletedAt: null,
  });
  await db.collection("students").doc(STUDENT_ID).set({
    name: "홍길동",
    email: STUDENT_EMAIL,
    status: "ACTIVE",
  });
}

describe("enterQuiz", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedOpenQuiz();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("출입코드가 일치하지 않으면 INVALID_ACCESS_CODE로 거부한다", async () => {
    await expect(
      enterQuiz.run(
        makeRequest(
          { quizId: QUIZ_ID, accessCode: "WRONG", studentId: STUDENT_ID, name: "홍길동" },
          STUDENT_EMAIL,
        ),
      ),
    ).rejects.toMatchObject({
      details: { code: "INVALID_ACCESS_CODE" },
    } satisfies Partial<HttpsError>);
  });

  it("학번은 맞지만 이름이 다르면 IDENTITY_MISMATCH로 거부한다", async () => {
    await expect(
      enterQuiz.run(
        makeRequest(
          { quizId: QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "다른이름" },
          STUDENT_EMAIL,
        ),
      ),
    ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
  });

  it("로그인 이메일이 명부의 이메일과 다르면 IDENTITY_MISMATCH로 거부한다", async () => {
    await expect(
      enterQuiz.run(
        makeRequest(
          { quizId: QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
          "someone-else@hoseo.edu",
        ),
      ),
    ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
  });

  it("이메일이 아직 등록되지 않은 학번은 NEEDS_EMAIL_REGISTRATION으로 응답한다", async () => {
    const db = testDb();
    await db.collection("students").doc(STUDENT_ID).update({ email: null });

    await expect(
      enterQuiz.run(
        makeRequest(
          { quizId: QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
          STUDENT_EMAIL,
        ),
      ),
    ).rejects.toMatchObject({ details: { code: "NEEDS_EMAIL_REGISTRATION" } });
  });

  it("검증을 통과하면 참가자 문서를 빈 map 필드로 생성한다", async () => {
    const response = await enterQuiz.run(
      makeRequest(
        { quizId: QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
        STUDENT_EMAIL,
      ),
    );

    expect(response.participantStatus).toBe("IN_PROGRESS");

    const participantSnap = await testDb()
      .collection("participants")
      .doc(`${QUIZ_ID}_${STUDENT_ID}`)
      .get();
    expect(participantSnap.exists).toBe(true);
    const participant = participantSnap.data()!;
    expect(participant.finalStatus).toBe("IN_PROGRESS");
    expect(participant.runsUsedByProblem).toEqual({});
    expect(participant.submissions).toEqual({});
    expect(participant.runResults).toEqual({});
  });

  it("이미 입장한 참가자가 다시 호출해도 기존 문서를 덮어쓰지 않는다(멱등성)", async () => {
    const request = makeRequest(
      { quizId: QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
      STUDENT_EMAIL,
    );
    await enterQuiz.run(request);

    const participantRef = testDb().collection("participants").doc(`${QUIZ_ID}_${STUDENT_ID}`);
    await participantRef.update({ "runsUsedByProblem.p1": 3 });

    await enterQuiz.run(request);

    const participant = (await participantRef.get()).data()!;
    expect(participant.runsUsedByProblem).toEqual({ p1: 3 });
  });
});
