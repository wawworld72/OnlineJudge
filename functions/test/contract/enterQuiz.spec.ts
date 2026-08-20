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

  it("영문 계정명 학번은 대소문자가 달라도 정규화되어 입장에 성공한다", async () => {
    const db = testDb();
    await db.collection("students").doc("gihyun.hong").set({
      name: "Gihyun Hong",
      email: "gihyun.hong@gmail.com",
      status: "ACTIVE",
    });

    const response = await enterQuiz.run(
      makeRequest(
        { quizId: QUIZ_ID, accessCode: "ABC123", studentId: "Gihyun.Hong", name: "gihyun hong" },
        "gihyun.hong@gmail.com",
      ),
    );

    expect(response.participantStatus).toBe("IN_PROGRESS");
    expect(response.studentId).toBe("gihyun.hong");
    const participantSnap = await db.collection("participants").doc(`${QUIZ_ID}_gihyun.hong`).get();
    expect(participantSnap.exists).toBe(true);
  });

  describe("퀴즈 종료 후 복기", () => {
    const CLOSED_QUIZ_ID = "quiz-closed";

    async function seedClosedQuiz() {
      const db = testDb();
      await db.collection("quizzes").doc(CLOSED_QUIZ_ID).set({
        title: "지난 중간고사",
        description: "",
        startAt: ts(-120_000),
        endAt: ts(-60_000),
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
    }

    it("이미 채점 완료된 참가자는 퀴즈 종료 후에도 재입장(복기)할 수 있다", async () => {
      await seedClosedQuiz();
      await testDb()
        .collection("participants")
        .doc(`${CLOSED_QUIZ_ID}_${STUDENT_ID}`)
        .set({
          quizId: CLOSED_QUIZ_ID,
          studentId: STUDENT_ID,
          enteredAt: ts(-100_000),
          finalStatus: "FINALIZED",
          finalSubmittedAt: ts(-90_000),
          finalTotal: 10,
          runsUsedByProblem: {},
          submissions: { p1: { code: "int main(){}", submittedAt: ts(-90_000) } },
          runResults: {
            p1: { status: "AC", score: 10, maxScore: 10, compileErrorMessage: null, tcResults: [] },
          },
          gradePushedAt: null,
        });

      const response = await enterQuiz.run(
        makeRequest(
          { quizId: CLOSED_QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
          STUDENT_EMAIL,
        ),
      );

      expect(response.participantStatus).toBe("FINALIZED");
      expect(response.existingSubmission?.p1.code).toBe("int main(){}");
      expect(response.gradedResult?.p1.score).toBe(10);
    });

    it("아직 IN_PROGRESS인 참가자는 퀴즈 종료 후 재입장이 QUIZ_NOT_OPEN으로 거부된다", async () => {
      await seedClosedQuiz();
      await testDb()
        .collection("participants")
        .doc(`${CLOSED_QUIZ_ID}_${STUDENT_ID}`)
        .set({
          quizId: CLOSED_QUIZ_ID,
          studentId: STUDENT_ID,
          enteredAt: ts(-100_000),
          finalStatus: "IN_PROGRESS",
          finalSubmittedAt: null,
          finalTotal: 0,
          runsUsedByProblem: {},
          submissions: {},
          runResults: {},
          gradePushedAt: null,
        });

      await expect(
        enterQuiz.run(
          makeRequest(
            { quizId: CLOSED_QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
            STUDENT_EMAIL,
          ),
        ),
      ).rejects.toMatchObject({ details: { code: "QUIZ_NOT_OPEN" } });
    });

    it("입장한 적 없는 학생은 퀴즈 종료 후 새 응시가 QUIZ_NOT_OPEN으로 거부된다", async () => {
      await seedClosedQuiz();

      await expect(
        enterQuiz.run(
          makeRequest(
            { quizId: CLOSED_QUIZ_ID, accessCode: "ABC123", studentId: STUDENT_ID, name: "홍길동" },
            STUDENT_EMAIL,
          ),
        ),
      ).rejects.toMatchObject({ details: { code: "QUIZ_NOT_OPEN" } });
    });
  });

  describe("Classroom 연동 퀴즈(courseId 있음)", () => {
    const COURSE_ID = "course-1";
    const CLASSROOM_QUIZ_ID = "quiz-classroom";

    async function seedClassroomQuiz() {
      await testDb().collection("quizzes").doc(CLASSROOM_QUIZ_ID).set({
        title: "중간고사",
        description: "",
        startAt: ts(-60_000),
        endAt: ts(60_000),
        accessCode: "ABC123",
        status: "OPEN",
        maxRunsPerProblem: 5,
        courseId: COURSE_ID,
        courseWorkId: null,
        courseWorkLink: null,
        archivedAt: null,
        archiveSpreadsheetUrl: null,
        deletedAt: null,
      });
    }

    it("학번/이름 없이 로그인 이메일만으로 명부에서 신원을 찾아 입장한다", async () => {
      await seedClassroomQuiz();
      await testDb().collection("rosters").doc(`${COURSE_ID}_20240002`).set({
        courseId: COURSE_ID,
        studentId: "20240002",
        name: "김철수",
        email: "student2@hoseo.edu",
        syncedAt: ts(0),
      });

      const response = await enterQuiz.run(
        makeRequest({ quizId: CLASSROOM_QUIZ_ID, accessCode: "ABC123" }, "student2@hoseo.edu"),
      );

      expect(response.participantStatus).toBe("IN_PROGRESS");
      expect(response.studentId).toBe("20240002");
      expect(response.studentName).toBe("김철수");
    });

    it("이 강의 명부에서 로그인 이메일을 찾을 수 없으면 NOT_IN_CLASSROOM_ROSTER로 거부한다", async () => {
      await seedClassroomQuiz();

      await expect(
        enterQuiz.run(
          makeRequest({ quizId: CLASSROOM_QUIZ_ID, accessCode: "ABC123" }, "unknown@hoseo.edu"),
        ),
      ).rejects.toMatchObject({ details: { code: "NOT_IN_CLASSROOM_ROSTER" } });
    });

    it("다른 강의 명부에만 있는 이메일로는 입장할 수 없다", async () => {
      await seedClassroomQuiz();
      await testDb().collection("rosters").doc("other-course_20240003").set({
        courseId: "other-course",
        studentId: "20240003",
        name: "이영희",
        email: "student3@hoseo.edu",
        syncedAt: ts(0),
      });

      await expect(
        enterQuiz.run(
          makeRequest({ quizId: CLASSROOM_QUIZ_ID, accessCode: "ABC123" }, "student3@hoseo.edu"),
        ),
      ).rejects.toMatchObject({ details: { code: "NOT_IN_CLASSROOM_ROSTER" } });
    });
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
