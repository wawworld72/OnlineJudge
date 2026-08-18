import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb, ts } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
  listStudentSubmissions: vi.fn(),
  patchGrade: vi.fn(),
}));

const { listCourseStudents, listStudentSubmissions, patchGrade } =
  await import("../../src/services/classroomClient");
const { pushGrades } = await import("../../src/callable/pushGrades");

const QUIZ_ID = "quiz-1";

async function seedDeployedQuiz() {
  await testDb()
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
      courseId: "course-1",
      courseWorkId: "cw-1",
      courseWorkLink: "https://classroom.example/cw-1",
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
    });
}

async function seedFinalizedParticipant(studentId: string, finalTotal: number) {
  await testDb()
    .collection("students")
    .doc(studentId)
    .set({
      name: studentId,
      email: `${studentId}@hoseo.edu`,
      status: "ACTIVE",
    });
  await testDb().collection("participants").doc(`${QUIZ_ID}_${studentId}`).set({
    quizId: QUIZ_ID,
    studentId,
    enteredAt: FieldValue.serverTimestamp(),
    finalStatus: "FINALIZED",
    finalSubmittedAt: Timestamp.now(),
    finalTotal,
    runsUsedByProblem: {},
    submissions: {},
    runResults: {},
    gradePushedAt: null,
  });
}

describe("pushGrades", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(listCourseStudents).mockReset();
    vi.mocked(listStudentSubmissions).mockReset();
    vi.mocked(patchGrade).mockReset();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("확정 채점된 참가자가 없으면 NO_FINALIZED_PARTICIPANTS로 거부한다", async () => {
    await seedDeployedQuiz();

    await expect(pushGrades.run(makeTeacherRequest({ quizId: QUIZ_ID }))).rejects.toMatchObject({
      details: { code: "NO_FINALIZED_PARTICIPANTS" },
    });
  });

  it("학번-이메일-Classroom 사용자-제출물 연결이 끊긴 학생은 건너뛰고 실패로 집계한다", async () => {
    await seedDeployedQuiz();
    await seedFinalizedParticipant("20240001", 90);
    vi.mocked(listCourseStudents).mockResolvedValue([]);
    vi.mocked(listStudentSubmissions).mockResolvedValue([]);

    const response = await pushGrades.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.succeeded).toBe(0);
    expect(response.failed).toBe(1);
    expect(response.failedStudentIds).toEqual(["20240001"]);
  });

  it("연결이 온전한 학생은 성적을 반영하고 gradePushedAt을 기록한다", async () => {
    await seedDeployedQuiz();
    await seedFinalizedParticipant("20240001", 90);
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);
    vi.mocked(listStudentSubmissions).mockResolvedValue([{ userId: "u1", submissionId: "sub-1" }]);
    vi.mocked(patchGrade).mockResolvedValue(undefined);

    const response = await pushGrades.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.succeeded).toBe(1);
    expect(response.failed).toBe(0);
    expect(patchGrade).toHaveBeenCalledWith(
      "course-1",
      "cw-1",
      "sub-1",
      90,
      process.env.CLASSROOM_TEACHER_EMAIL,
    );

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_20240001`).get()
    ).data()!;
    expect(participant.gradePushedAt).not.toBeNull();
  });
});
