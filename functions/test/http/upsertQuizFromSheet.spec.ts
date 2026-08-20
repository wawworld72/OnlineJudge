import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { clearFirestore, teardownTestApp, testDb, ts } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
  createCourseWork: vi.fn(),
}));

const { listCourseStudents, createCourseWork } = await import("../../src/services/classroomClient");
const { upsertQuizFromSheet } = await import("../../src/http/upsertQuizFromSheet");

const TOKEN = process.env.SHEET_SYNC_API_TOKEN!;

function makeReq(opts: { token?: string; body?: unknown }) {
  return {
    get: (name: string) =>
      name === "Authorization" && opts.token ? `Bearer ${opts.token}` : undefined,
    body: opts.body ?? {},
  } as never;
}

function makeRes() {
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

async function call(body: unknown) {
  const res = makeRes();
  await upsertQuizFromSheet(makeReq({ token: TOKEN, body }), res as never);
  return res.json.mock.calls[0]![0];
}

const CREATE_BASE = {
  subjectName: "컴퓨터프로그래밍심화",
  title: "중간고사",
  description: "1~5장",
  startAt: Date.now() - 60_000,
  endAt: Date.now() + 60_000,
  accessCode: "ABC123",
  maxRunsPerProblem: 5,
};

describe("upsertQuizFromSheet", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(listCourseStudents).mockReset();
    vi.mocked(createCourseWork).mockReset();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("토큰이 없거나 틀리면 unauthorized를 반환한다", async () => {
    const res = makeRes();
    await upsertQuizFromSheet(makeReq({ token: "wrong", body: CREATE_BASE }), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "unauthorized" });
  });

  it("생성 시 필수 필드가 빠지면 malformed 오류를 반환한다", async () => {
    const body = await call({ title: "중간고사" });
    expect(body.ok).toBe(false);
    expect(body.error).toContain("신규 퀴즈 생성 시 필수 항목입니다");
  });

  it("전체 payload로 신규 퀴즈를 생성하고 quizUrl을 반환한다", async () => {
    const body = await call(CREATE_BASE);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("created");
    expect(body.status).toBe("DRAFT");
    expect(body.quizUrl).toBe(`${process.env.APP_BASE_URL}/quiz/${body.quizId}`);
    expect(body.courseWorkLink).toBeNull();

    const quiz = (await testDb().collection("quizzes").doc(body.quizId).get()).data()!;
    expect(quiz.subjectName).toBe("컴퓨터프로그래밍심화");
    expect(quiz.accessCode).toBe("ABC123");
  });

  it("존재하지 않는 quizId로 갱신을 시도하면 새로 만들지 않고 실패한다", async () => {
    const body = await call({ quizId: "no-such-quiz", accessCode: "XYZ" });
    expect(body.ok).toBe(false);
    expect(body.error).toContain("찾을 수 없습니다");
    const snap = await testDb().collection("quizzes").doc("no-such-quiz").get();
    expect(snap.exists).toBe(false);
  });

  it("존재하지 않는 quizUrl로 갱신을 시도해도 마찬가지로 실패한다", async () => {
    const body = await call({
      quizUrl: `${process.env.APP_BASE_URL}/quiz/typo-id`,
      accessCode: "XYZ",
    });
    expect(body.ok).toBe(false);
    expect(body.error).toContain("찾을 수 없습니다");
  });

  it("삭제된 퀴즈를 갱신하려 하면 실패한다", async () => {
    await testDb()
      .collection("quizzes")
      .doc("deleted-quiz")
      .set({
        ...CREATE_BASE,
        startAt: ts(-60_000),
        endAt: ts(60_000),
        status: "DRAFT",
        courseId: null,
        courseWorkId: null,
        courseWorkLink: null,
        archivedAt: null,
        archiveSpreadsheetUrl: null,
        deletedAt: ts(0),
      });
    const body = await call({ quizId: "deleted-quiz", accessCode: "XYZ" });
    expect(body.ok).toBe(false);
    expect(body.error).toContain("찾을 수 없습니다");
  });

  it("일부 필드만 보낸 갱신은 나머지 필드를 그대로 유지한다", async () => {
    const created = await call(CREATE_BASE);
    const body = await call({ quizId: created.quizId, accessCode: "NEWCODE" });
    expect(body.ok).toBe(true);
    const quiz = (await testDb().collection("quizzes").doc(created.quizId).get()).data()!;
    expect(quiz.accessCode).toBe("NEWCODE");
    expect(quiz.title).toBe("중간고사"); // 안 보낸 필드는 그대로
  });

  it("problems 없는 갱신은 기존 문항을 건드리지 않는다", async () => {
    const created = await call({
      ...CREATE_BASE,
      problems: [
        {
          title: "레벨업",
          description: "설명",
          initialCode: "",
          testCases: [{ tcNo: 1, input: "1", expected: "1", points: 10, isPublic: true }],
        },
      ],
    });
    await call({ quizId: created.quizId, accessCode: "OTHER" });

    const problemsSnap = await testDb()
      .collection("quizzes")
      .doc(created.quizId)
      .collection("problems")
      .get();
    expect(problemsSnap.size).toBe(1);
  });

  describe("문항 매칭(title)", () => {
    it("제목이 일치하는 기존 문항은 보낸 필드만 부분 갱신된다", async () => {
      const created = await call({
        ...CREATE_BASE,
        problems: [{ title: "레벨업", description: "원래 설명", initialCode: "int main(){}" }],
      });

      const body = await call({
        quizId: created.quizId,
        problems: [{ title: "레벨업", description: "수정된 설명" }],
      });

      expect(body.ok).toBe(true);
      expect(body.problems).toHaveLength(1);
      expect(body.problems[0].mode).toBe("updated");
      const problemsSnap = await testDb()
        .collection("quizzes")
        .doc(created.quizId)
        .collection("problems")
        .get();
      expect(problemsSnap.size).toBe(1); // 새로 안 만들어짐
      const problem = problemsSnap.docs[0]!.data();
      expect(problem.description).toBe("수정된 설명");
      expect(problem.initialCode).toBe("int main(){}"); // 안 보낸 필드는 유지
    });

    it("제목이 일치하는 문항이 없고 필수 필드를 포함하면 신규 문항이 생성된다", async () => {
      const created = await call(CREATE_BASE);
      const body = await call({
        quizId: created.quizId,
        problems: [{ title: "새문항", description: "설명", initialCode: "" }],
      });
      expect(body.ok).toBe(true);
      expect(body.problems[0].mode).toBe("created");
    });

    it("제목이 일치하는 문항이 없고 필수 필드가 빠지면 거부하고 아무것도 쓰지 않는다", async () => {
      const created = await call(CREATE_BASE);
      const body = await call({
        quizId: created.quizId,
        problems: [{ title: "새문항" }],
      });
      expect(body.ok).toBe(false);
      expect(body.error).toContain("새문항");
      const problemsSnap = await testDb()
        .collection("quizzes")
        .doc(created.quizId)
        .collection("problems")
        .get();
      expect(problemsSnap.size).toBe(0);
    });

    it("같은 제목의 문항이 이미 2개 이상이면 모호함 오류를 반환한다", async () => {
      const created = await call(CREATE_BASE);
      const quizRef = testDb().collection("quizzes").doc(created.quizId);
      await quizRef
        .collection("problems")
        .doc("p1")
        .set({
          order: 0,
          title: "중복",
          description: "",
          initialCode: "",
          maxRuns: null,
          pointsTotal: 0,
          updatedAt: ts(0),
          deletedAt: null,
        });
      await quizRef
        .collection("problems")
        .doc("p2")
        .set({
          order: 1,
          title: "중복",
          description: "",
          initialCode: "",
          maxRuns: null,
          pointsTotal: 0,
          updatedAt: ts(0),
          deletedAt: null,
        });

      const body = await call({
        quizId: created.quizId,
        problems: [{ title: "중복", description: "x" }],
      });
      expect(body.ok).toBe(false);
      expect(body.error).toContain("여러 개 존재");
    });
  });

  describe("테스트케이스 매칭(tcNo)", () => {
    async function createWithOneProblem() {
      return call({
        ...CREATE_BASE,
        problems: [
          {
            title: "레벨업",
            description: "설명",
            initialCode: "",
            testCases: [
              { tcNo: 1, input: "1", expected: "1", points: 40, isPublic: true },
              { tcNo: 2, input: "2", expected: "2", points: 60, isPublic: false },
            ],
          },
        ],
      });
    }

    it("tcNo가 일치하면 보낸 필드만 부분 갱신되고 pointsTotal이 재계산된다", async () => {
      const created = await createWithOneProblem();
      const body = await call({
        quizId: created.quizId,
        problems: [{ title: "레벨업", testCases: [{ tcNo: 2, points: 30 }] }],
      });
      expect(body.ok).toBe(true);
      expect(body.problems[0].pointsTotal).toBe(70); // 40 + 30
      expect(body.problems[0].testCaseCount).toBe(2);
    });

    it("tcNo가 일치하지 않고 필수 필드를 다 포함하면 새 TC가 추가된다", async () => {
      const created = await createWithOneProblem();
      const body = await call({
        quizId: created.quizId,
        problems: [
          {
            title: "레벨업",
            testCases: [{ tcNo: 3, input: "3", expected: "3", points: 10, isPublic: true }],
          },
        ],
      });
      expect(body.ok).toBe(true);
      expect(body.problems[0].testCaseCount).toBe(3);
      expect(body.problems[0].pointsTotal).toBe(110);
    });

    it("tcNo가 일치하지 않고 필수 필드가 빠지면 거부하고 아무것도 안 쓴다", async () => {
      const created = await createWithOneProblem();
      const body = await call({
        quizId: created.quizId,
        problems: [{ title: "레벨업", testCases: [{ tcNo: 9, points: 10 }] }],
      });
      expect(body.ok).toBe(false);
      expect(body.error).toContain("TC 9");

      const problemsSnap = await testDb()
        .collection("quizzes")
        .doc(created.quizId)
        .collection("problems")
        .get();
      const secretsSnap = await testDb()
        .collection("quizzes")
        .doc(created.quizId)
        .collection("problemSecrets")
        .doc(problemsSnap.docs[0]!.id)
        .get();
      expect((secretsSnap.data()?.items ?? []).length).toBe(2); // 안 늘어남
    });
  });

  it("courseId는 문자열/null/생략에 따라 각각 설정/해제/유지된다", async () => {
    const created = await call({ ...CREATE_BASE, courseId: "12345" });
    let quiz = (await testDb().collection("quizzes").doc(created.quizId).get()).data()!;
    expect(quiz.courseId).toBe("12345");

    await call({ quizId: created.quizId, accessCode: "X" }); // courseId 생략
    quiz = (await testDb().collection("quizzes").doc(created.quizId).get()).data()!;
    expect(quiz.courseId).toBe("12345"); // 유지

    await call({ quizId: created.quizId, courseId: null });
    quiz = (await testDb().collection("quizzes").doc(created.quizId).get()).data()!;
    expect(quiz.courseId).toBeNull();
  });

  it("startAt/endAt을 ISO 문자열과 epoch millis를 섞어 보내도 정상 저장된다", async () => {
    const body = await call({
      ...CREATE_BASE,
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: Date.now() + 120_000,
    });
    expect(body.ok).toBe(true);
    const quiz = (await testDb().collection("quizzes").doc(body.quizId).get()).data()!;
    expect(quiz.startAt.toMillis()).toBeLessThan(quiz.endAt.toMillis());
  });

  describe("Classroom 자동 배포", () => {
    it("courseId+문항/TC/명부까지 갖췄으면 이번 호출 안에서 배포까지 끝난다", async () => {
      vi.mocked(listCourseStudents).mockResolvedValue([
        { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
      ]);
      vi.mocked(createCourseWork).mockResolvedValue({
        courseWorkId: "cw-1",
        alternateLink: "https://classroom.example/cw-1",
      });

      const body = await call({
        ...CREATE_BASE,
        courseId: "course-1",
        problems: [
          {
            title: "레벨업",
            description: "설명",
            initialCode: "",
            testCases: [{ tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true }],
          },
        ],
      });

      expect(body.ok).toBe(true);
      expect(body.courseWorkLink).toBe("https://classroom.example/cw-1");
      expect(body.classroomDeployPending).toBe(false);
      const quiz = (await testDb().collection("quizzes").doc(body.quizId).get()).data()!;
      expect(quiz.courseWorkId).toBe("cw-1");
    });

    it("문항이 아직 없으면 배포를 건너뛰되 퀴즈 생성 자체는 성공한다", async () => {
      const body = await call({ ...CREATE_BASE, courseId: "course-1" });
      expect(body.ok).toBe(true);
      expect(body.courseWorkLink).toBeNull();
      expect(body.classroomDeployPending).toBe(true);
      expect(createCourseWork).not.toHaveBeenCalled();
    });

    it("이미 배포된 퀴즈는 재배포하지 않고 기존 courseWorkLink를 그대로 반환한다", async () => {
      vi.mocked(listCourseStudents).mockResolvedValue([
        { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
      ]);
      vi.mocked(createCourseWork).mockResolvedValue({
        courseWorkId: "cw-1",
        alternateLink: "https://classroom.example/cw-1",
      });
      const created = await call({
        ...CREATE_BASE,
        courseId: "course-1",
        problems: [
          {
            title: "레벨업",
            description: "설명",
            initialCode: "",
            testCases: [{ tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true }],
          },
        ],
      });
      expect(created.courseWorkLink).toBe("https://classroom.example/cw-1");

      vi.mocked(createCourseWork).mockClear();
      const body = await call({ quizId: created.quizId, accessCode: "X" });
      expect(body.courseWorkLink).toBe("https://classroom.example/cw-1");
      expect(createCourseWork).not.toHaveBeenCalled();
    });

    it("Classroom API가 실패해도 퀴즈 생성/갱신 응답은 성공하고 courseWorkLink만 null이다", async () => {
      vi.mocked(listCourseStudents).mockResolvedValue([
        { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
      ]);
      vi.mocked(createCourseWork).mockRejectedValue(new Error("Classroom API 오류"));

      const body = await call({
        ...CREATE_BASE,
        courseId: "course-1",
        problems: [
          {
            title: "레벨업",
            description: "설명",
            initialCode: "",
            testCases: [{ tcNo: 1, input: "1", expected: "1", points: 100, isPublic: true }],
          },
        ],
      });

      expect(body.ok).toBe(true);
      expect(body.courseWorkLink).toBeNull();
      expect(body.classroomDeployPending).toBe(true);
    });
  });
});
