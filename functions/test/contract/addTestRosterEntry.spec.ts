import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
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

  afterAll(async () => {
    await teardownTestApp();
  });

  it("명부 문서를 정확한 필드로 만든다", async () => {
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
