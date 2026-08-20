import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
}));

const { listCourseStudents } = await import("../../src/services/classroomClient");
const { setQuizStatus } = await import("../../src/callable/setQuizStatus");

const QUIZ_ID = "quiz-1";

async function seedQuiz(overrides: Record<string, unknown> = {}) {
  await testDb()
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
      title: "중간고사",
      description: "",
      startAt: Timestamp.fromMillis(Date.now()),
      endAt: Timestamp.fromMillis(Date.now() + 60_000),
      accessCode: "ABC123",
      status: "DRAFT",
      maxRunsPerProblem: 5,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
      ...overrides,
    });
}

async function seedDeployableProblem() {
  const db = testDb();
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

describe("setQuizStatus", () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedQuiz();
    vi.mocked(listCourseStudents).mockReset();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("차단 항목이 있으면 OPEN 전환을 거부한다", async () => {
    await expect(
      setQuizStatus.run(makeTeacherRequest({ quizId: QUIZ_ID, status: "OPEN" })),
    ).rejects.toMatchObject({ details: { code: "BLOCKED_BY_PREDEPLOY_CHECK" } });

    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.status).toBe("DRAFT");
  });

  it("차단 항목이 없으면 OPEN으로 전환된다", async () => {
    await seedDeployableProblem();

    const response = await setQuizStatus.run(
      makeTeacherRequest({ quizId: QUIZ_ID, status: "OPEN" }),
    );

    expect(response.status).toBe("OPEN");
    const quiz = (await testDb().collection("quizzes").doc(QUIZ_ID).get()).data()!;
    expect(quiz.status).toBe("OPEN");
  });

  it("CLOSED로 전환할 때는 배포 전 점검을 요구하지 않는다", async () => {
    const response = await setQuizStatus.run(
      makeTeacherRequest({ quizId: QUIZ_ID, status: "CLOSED" }),
    );
    expect(response.status).toBe("CLOSED");
  });

  describe("Classroom 연동 퀴즈(courseId 있음)의 OPEN 전환", () => {
    // 명부(rosters)는 퀴즈가 아니라 courseId(Classroom 강의) 단위로 저장되므로, OPEN
    // 전환은 여기서 다시 동기화를 시도하지 않는다 — 동기화는 "Classroom 연동" 탭에서
    // 교사가 강의당 한 번만 직접 실행한다(같은 강의를 쓰는 다른 퀴즈에도 그대로 적용됨).

    it("한 번도 동기화하지 않았으면 OPEN 전환을 차단하고, 자동으로 동기화를 시도하지도 않는다", async () => {
      await seedQuiz({ courseId: "course-1" });
      await seedDeployableProblem();

      await expect(
        setQuizStatus.run(makeTeacherRequest({ quizId: QUIZ_ID, status: "OPEN" })),
      ).rejects.toMatchObject({ details: { code: "BLOCKED_BY_PREDEPLOY_CHECK" } });
      expect(listCourseStudents).not.toHaveBeenCalled();
    });

    it("이미 동기화된 명부가 있으면 재동기화 시도 없이 그대로 OPEN이 허용된다", async () => {
      await seedQuiz({ courseId: "course-1" });
      await seedDeployableProblem();
      await testDb().collection("rosters").doc("course-1_20240001").set({
        courseId: "course-1",
        studentId: "20240001",
        name: "홍길동",
        email: "20240001@hoseo.edu",
        syncedAt: FieldValue.serverTimestamp(),
      });

      const response = await setQuizStatus.run(
        makeTeacherRequest({ quizId: QUIZ_ID, status: "OPEN" }),
      );

      expect(response.status).toBe("OPEN");
      expect(listCourseStudents).not.toHaveBeenCalled();
    });
  });
});
