import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeRequest,
  makeTeacherRequest,
  clearFirestore,
  teardownTestApp,
  testDb,
  ts,
} from "../testEnv";
import { addGlobalTestAccount } from "../../src/callable/addGlobalTestAccount";
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

const COURSE_ID = "course-1";
const CLASSROOM_QUIZ_ID = "quiz-classroom";
const PLAIN_QUIZ_ID = "quiz-plain";

async function seedClassroomQuiz() {
  await testDb()
    .collection("quizzes")
    .doc(CLASSROOM_QUIZ_ID)
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

describe("addGlobalTestAccount", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("students 문서를 isGlobalTestAccount: true로 만든다", async () => {
    await addGlobalTestAccount.run(
      makeTeacherRequest({ studentId: "Test.User", name: "테스트학생", email: "tester@hoseo.edu" }),
    );

    const doc = await testDb().collection("students").doc("test.user").get();
    expect(doc.exists).toBe(true);
    const student = doc.data()!;
    expect(student.name).toBe("테스트학생");
    expect(student.email).toBe("tester@hoseo.edu");
    expect(student.status).toBe("ACTIVE");
    expect(student.isGlobalTestAccount).toBe(true);
  });

  it("이미 존재하는 학번이면 STUDENT_ID_TAKEN으로 거부하고 아무것도 덮어쓰지 않는다", async () => {
    await testDb().collection("students").doc("test001").set({
      name: "실제학생",
      email: "real@hoseo.edu",
      status: "ACTIVE",
    });

    await expect(
      addGlobalTestAccount.run(
        makeTeacherRequest({ studentId: "test001", name: "테스트학생", email: "tester@hoseo.edu" }),
      ),
    ).rejects.toMatchObject({ details: { code: "STUDENT_ID_TAKEN" } });

    const student = (await testDb().collection("students").doc("test001").get()).data()!;
    expect(student.email).toBe("real@hoseo.edu");
  });

  it("분반 명부(rosters)에 등록하지 않아도 Classroom 연동 퀴즈에 입장할 수 있다", async () => {
    await seedClassroomQuiz();
    await addGlobalTestAccount.run(
      makeTeacherRequest({ studentId: "test001", name: "테스트학생", email: "tester@hoseo.edu" }),
    );

    const response = await enterQuiz.run(
      makeRequest({ quizId: CLASSROOM_QUIZ_ID, accessCode: "ABC123" }, "tester@hoseo.edu"),
    );

    expect(response.studentId).toBe("test001");
    expect(response.studentName).toBe("테스트학생");
    expect(response.isTestEntry).toBe(true);
    expect(response.participantStatus).toBe("IN_PROGRESS");
  });

  it("Classroom 미연동 퀴즈에도 등록 없이 이 이메일 하나로 입장·실행·제출까지 전부 성공한다(마감·상태와 무관)", async () => {
    const db = testDb();
    await db
      .collection("quizzes")
      .doc(PLAIN_QUIZ_ID)
      .set({
        title: "쪽지시험",
        description: "",
        startAt: ts(-120_000),
        endAt: ts(-60_000), // 이미 종료됨
        accessCode: "ABC123",
        status: "CLOSED",
        maxRunsPerProblem: 1,
        courseId: null,
        courseWorkId: null,
        courseWorkLink: null,
        archivedAt: null,
        archiveSpreadsheetUrl: null,
        deletedAt: null,
      });
    await db
      .collection("quizzes")
      .doc(PLAIN_QUIZ_ID)
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
      .doc(PLAIN_QUIZ_ID)
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
    await addGlobalTestAccount.run(
      makeTeacherRequest({ studentId: "test001", name: "테스트학생", email: "tester@hoseo.edu" }),
    );

    const enterResponse = await enterQuiz.run(
      makeRequest({ quizId: PLAIN_QUIZ_ID, accessCode: "" }, "tester@hoseo.edu"),
    );
    expect(enterResponse.isTestEntry).toBe(true);
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
    // maxRunsPerProblem은 1 — 두 번째 실행도 성공해야 실행 횟수 제한 우회를 함께 확인한다.
    await practiceRun.run(
      makeRequest({ quizId: PLAIN_QUIZ_ID, problemId: "p1", code: "code-1" }, "tester@hoseo.edu"),
    );
    const runResponse = await practiceRun.run(
      makeRequest({ quizId: PLAIN_QUIZ_ID, problemId: "p1", code: "code-2" }, "tester@hoseo.edu"),
    );
    expect(runResponse.status).toBe("AC");

    const submitResponse = await finalSubmit.run(
      makeRequest(
        { quizId: PLAIN_QUIZ_ID, submissions: [{ problemId: "p1", code: "code-2" }] },
        "tester@hoseo.edu",
      ),
    );
    expect(submitResponse.participantStatus).toBe("SUBMITTED");
  });
});
