import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb, ts } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  createCourseWork: vi.fn(),
}));

const { createCourseWork } = await import("../../src/services/classroomClient");
const { deployClassroomAssignment, resetClassroomDeployment } =
  await import("../../src/callable/classroomAssignment");

const QUIZ_ID = "quiz-1";

async function seedDeployableQuiz() {
  const db = testDb();
  await db
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
      courseId: "course-1",
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
    });
  await db.collection("quizzes").doc(QUIZ_ID).collection("problems").doc("p1").set({
    order: 0,
    title: "문제1",
    description: "",
    initialCode: "",
    maxRuns: null,
    pointsTotal: 100,
    updatedAt: FieldValue.serverTimestamp(),
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
      updatedAt: FieldValue.serverTimestamp(),
    });
}

describe("deployClassroomAssignment / resetClassroomDeployment", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(createCourseWork).mockReset();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("배포 전 점검을 통과한 퀴즈를 배포하면 courseWorkId/Link를 저장한다", async () => {
    await seedDeployableQuiz();
    vi.mocked(createCourseWork).mockResolvedValue({
      courseWorkId: "cw-1",
      alternateLink: "https://classroom.example/cw-1",
    });

    const response = await deployClassroomAssignment.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    expect(response.courseWorkId).toBe("cw-1");
    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.courseWorkId).toBe("cw-1");
    expect(quiz.courseWorkLink).toBe("https://classroom.example/cw-1");
  });

  it("이미 배포된 퀴즈의 재배포 요청을 거부한다", async () => {
    await seedDeployableQuiz();
    await testDb().collection("quizzes").doc(QUIZ_ID).update({ courseWorkId: "cw-1" });

    await expect(
      deployClassroomAssignment.run(makeTeacherRequest({ quizId: QUIZ_ID })),
    ).rejects.toMatchObject({ details: { code: "ALREADY_DEPLOYED" } });
  });

  it("배포 전 점검을 통과하지 못한 퀴즈는 배포를 거부한다", async () => {
    await testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .set({
        title: "중간고사",
        description: "",
        startAt: ts(-60_000),
        endAt: ts(60_000),
        accessCode: "ABC123",
        status: "DRAFT",
        maxRunsPerProblem: 5,
        courseId: "course-1",
        courseWorkId: null,
        courseWorkLink: null,
        archivedAt: null,
        archiveSpreadsheetUrl: null,
        deletedAt: null,
      });

    await expect(
      deployClassroomAssignment.run(makeTeacherRequest({ quizId: QUIZ_ID })),
    ).rejects.toMatchObject({ details: { code: "BLOCKED_BY_PREDEPLOY_CHECK" } });
  });

  it("resetClassroomDeployment 이후에는 다시 배포할 수 있다", async () => {
    await seedDeployableQuiz();
    await testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .update({ courseWorkId: "cw-1", courseWorkLink: "https://classroom.example/cw-1" });

    await resetClassroomDeployment.run(makeTeacherRequest({ quizId: QUIZ_ID }));

    vi.mocked(createCourseWork).mockResolvedValue({
      courseWorkId: "cw-2",
      alternateLink: "https://classroom.example/cw-2",
    });
    const response = await deployClassroomAssignment.run(makeTeacherRequest({ quizId: QUIZ_ID }));
    expect(response.courseWorkId).toBe("cw-2");
  });
});
