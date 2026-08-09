import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
  createCourseWork: vi.fn(),
  listStudentSubmissions: vi.fn(),
  patchGrade: vi.fn(),
}));

const { listCourseStudents, createCourseWork, listStudentSubmissions, patchGrade } = await import(
  "../../src/services/classroomClient"
);
const { syncRoster } = await import("../../src/callable/syncRoster");
const { deployClassroomAssignment } = await import("../../src/callable/classroomAssignment");
const { pushGrades } = await import("../../src/callable/pushGrades");

const TEACHER_EMAIL = "teacher@hoseo.edu";
const QUIZ_ID = "quiz-1";
const COURSE_ID = "course-1";

describe("교사의 Classroom 연동 흐름 (수강생 동기화 → 과제 배포 → 성적 반영)", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(listCourseStudents).mockReset();
    vi.mocked(createCourseWork).mockReset();
    vi.mocked(listStudentSubmissions).mockReset();
    vi.mocked(patchGrade).mockReset();

    await testDb().collection("quizzes").doc(QUIZ_ID).set({
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
    await testDb().collection("quizzes").doc(QUIZ_ID).collection("problems").doc("p1").set({
      order: 0,
      title: "문제1",
      description: "",
      initialCode: "",
      maxRuns: null,
      pointsTotal: 100,
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });
    await testDb().collection("quizzes").doc(QUIZ_ID).collection("problemSecrets").doc("p1").set({
      items: [{ tcId: "tc1", tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true, description: "" }],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("수강생 동기화 → 과제 배포 → 성적 반영을 순서대로 실행한다", async () => {
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);
    const syncResult = await syncRoster.run(makeRequest({ courseId: COURSE_ID }, TEACHER_EMAIL));
    expect(syncResult.newStudents).toBe(1);

    vi.mocked(createCourseWork).mockResolvedValue({
      courseWorkId: "cw-1",
      alternateLink: "https://classroom.example/cw-1",
    });
    const deployResult = await deployClassroomAssignment.run(
      makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL),
    );
    expect(deployResult.courseWorkId).toBe("cw-1");

    await testDb()
      .collection("participants")
      .doc(`${QUIZ_ID}_20240001`)
      .set({
        quizId: QUIZ_ID,
        studentId: "20240001",
        enteredAt: FieldValue.serverTimestamp(),
        finalStatus: "FINALIZED",
        finalSubmittedAt: Timestamp.now(),
        finalTotal: 100,
        completedCount: 1,
        totalCount: 1,
        runsUsedByProblem: {},
        submissions: {},
        runResults: {},
        gradePushedAt: null,
      });

    vi.mocked(listStudentSubmissions).mockResolvedValue([{ userId: "u1", submissionId: "sub-1" }]);
    vi.mocked(patchGrade).mockResolvedValue(undefined);
    const pushResult = await pushGrades.run(makeRequest({ quizId: QUIZ_ID }, TEACHER_EMAIL));

    expect(pushResult.succeeded).toBe(1);
    expect(patchGrade).toHaveBeenCalledWith(COURSE_ID, "cw-1", "sub-1", 100);
  });
});
