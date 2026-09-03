import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFirestore,
  makeRequest,
  makeTeacherRequest,
  teardownTestApp,
  testDb,
  ts,
} from "../testEnv";
import { addTestRosterEntry } from "../../src/callable/addTestRosterEntry";
import { enterQuiz } from "../../src/callable/enterQuiz";
import { practiceRun } from "../../src/callable/practiceRun";
import { finalSubmit } from "../../src/callable/finalSubmit";

function mockGraderResponse(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response);
}

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
}));

const { listCourseStudents } = await import("../../src/services/classroomClient");
const { syncRoster } = await import("../../src/callable/syncRoster");

const COURSE_ID = "course-1";
const QUIZ_ID = "quiz-classroom";

async function seedClassroomQuiz() {
  await testDb()
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
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

describe("addTestRosterEntry", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(listCourseStudents).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("명부 문서를 정확한 필드로 만들고, isTestEntry가 찍힌다", async () => {
    await addTestRosterEntry.run(
      makeTeacherRequest({
        courseId: COURSE_ID,
        studentId: "Test.User",
        name: "테스트학생",
        email: "tester@hoseo.edu",
      }),
    );

    const doc = await testDb().collection("rosters").doc(`${COURSE_ID}_test.user`).get();
    expect(doc.exists).toBe(true);
    const roster = doc.data()!;
    expect(roster.courseId).toBe(COURSE_ID);
    expect(roster.studentId).toBe("test.user"); // normalizeStudentId로 소문자화됨
    expect(roster.name).toBe("테스트학생");
    expect(roster.email).toBe("tester@hoseo.edu");
    expect(roster.isTestEntry).toBe(true);
  });

  it("students 문서도 함께 만든다 — 없으면 practiceRun/finalSubmit이 IDENTITY_MISMATCH로 막힌다", async () => {
    await addTestRosterEntry.run(
      makeTeacherRequest({
        courseId: COURSE_ID,
        studentId: "test001",
        name: "테스트학생",
        email: "tester@hoseo.edu",
      }),
    );

    const doc = await testDb().collection("students").doc("test001").get();
    expect(doc.exists).toBe(true);
    const student = doc.data()!;
    expect(student.name).toBe("테스트학생");
    expect(student.email).toBe("tester@hoseo.edu");
    expect(student.status).toBe("ACTIVE");
  });

  it("이미 존재하는 학번이면 STUDENT_ID_TAKEN으로 거부하고 아무것도 쓰지 않는다", async () => {
    await testDb().collection("students").doc("test001").set({
      name: "실제학생",
      email: "real@hoseo.edu",
      status: "ACTIVE",
    });

    await expect(
      addTestRosterEntry.run(
        makeTeacherRequest({
          courseId: COURSE_ID,
          studentId: "test001",
          name: "테스트학생",
          email: "tester@hoseo.edu",
        }),
      ),
    ).rejects.toMatchObject({ details: { code: "STUDENT_ID_TAKEN" } });

    // 기존 실제 학생 문서가 그대로 보존됐는지, 로스터도 안 만들어졌는지 확인.
    const student = (await testDb().collection("students").doc("test001").get()).data()!;
    expect(student.email).toBe("real@hoseo.edu");
    const roster = await testDb().collection("rosters").doc(`${COURSE_ID}_test001`).get();
    expect(roster.exists).toBe(false);
  });

  it("추가한 이메일로 실제 enterQuiz가 Classroom 연동 퀴즈에 성공적으로 입장시킨다", async () => {
    await seedClassroomQuiz();
    await addTestRosterEntry.run(
      makeTeacherRequest({
        courseId: COURSE_ID,
        studentId: "test001",
        name: "테스트학생",
        email: "tester@hoseo.edu",
      }),
    );

    const response = await enterQuiz.run(
      makeRequest({ quizId: QUIZ_ID, accessCode: "ABC123" }, "tester@hoseo.edu"),
    );

    expect(response.studentId).toBe("test001");
    expect(response.studentName).toBe("테스트학생");
    expect(response.participantStatus).toBe("IN_PROGRESS");
  });

  it("퀴즈가 CLOSED 상태이고 종료 시각도 지났어도 입장·실행·제출까지 전부 성공한다", async () => {
    const db = testDb();
    await db
      .collection("quizzes")
      .doc(QUIZ_ID)
      .set({
        title: "중간고사",
        description: "",
        startAt: ts(-120_000),
        endAt: ts(-60_000), // 이미 종료됨
        accessCode: "ABC123",
        status: "CLOSED", // 아직 공개 전이거나 이미 마감된 상태
        maxRunsPerProblem: 5,
        courseId: COURSE_ID,
        courseWorkId: null,
        courseWorkLink: null,
        archivedAt: null,
        archiveSpreadsheetUrl: null,
        deletedAt: null,
      });
    await db
      .collection("quizzes")
      .doc(QUIZ_ID)
      .collection("problems")
      .doc("p1")
      .set({
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
      .doc("p1")
      .set({
        items: [
          {
            tcId: "tc1",
            tcNo: 1,
            input: "1",
            expected: "1",
            points: 100,
            isPublic: true,
            description: "",
          },
        ],
        updatedAt: ts(0),
      });
    await addTestRosterEntry.run(
      makeTeacherRequest({
        courseId: COURSE_ID,
        studentId: "test001",
        name: "테스트학생",
        email: "tester@hoseo.edu",
      }),
    );

    const enterResponse = await enterQuiz.run(
      makeRequest({ quizId: QUIZ_ID, accessCode: "ABC123" }, "tester@hoseo.edu"),
    );
    expect(enterResponse.participantStatus).toBe("IN_PROGRESS");

    mockGraderResponse({
      ok: true,
      status: "JUDGED",
      score: 100,
      maxScore: 100,
      compileErrorMessage: null,
      tcResultsFull: [
        {
          result: "✅PASS",
          earned: 100,
          isPublic: true,
          input: "1",
          expected: "1",
          actual: "1",
          memo: "",
        },
      ],
    });
    const runResponse = await practiceRun.run(
      makeRequest({ quizId: QUIZ_ID, problemId: "p1", code: "int main(){}" }, "tester@hoseo.edu"),
    );
    expect(runResponse.status).toBe("AC");

    const submitResponse = await finalSubmit.run(
      makeRequest(
        { quizId: QUIZ_ID, submissions: [{ problemId: "p1", code: "int main(){}" }] },
        "tester@hoseo.edu",
      ),
    );
    expect(submitResponse.participantStatus).toBe("SUBMITTED");
  });

  it("실제 수강생 동기화를 실행하면 이 studentId가 없는 응답에 의해 자동으로 정리된다", async () => {
    await addTestRosterEntry.run(
      makeTeacherRequest({
        courseId: COURSE_ID,
        studentId: "test001",
        name: "테스트학생",
        email: "tester@hoseo.edu",
      }),
    );
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);

    await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    const doc = await testDb().collection("rosters").doc(`${COURSE_ID}_test001`).get();
    expect(doc.exists).toBe(false);
  });
});
