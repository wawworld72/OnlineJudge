import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, teardownTestApp, testDb, ts } from "../testEnv";
import { exportQuizResultToSheet } from "../../src/http/exportQuizResultToSheet";

const TOKEN = process.env.SHEET_EXPORT_API_TOKEN!;
const SUBJECT = "컴퓨터프로그래밍심화";
const QUIZ_ID = "quiz-1";

function makeReq(opts: { token?: string; quizId?: string; quizUrl?: string }) {
  return {
    get: (name: string) =>
      name === "Authorization" && opts.token ? `Bearer ${opts.token}` : undefined,
    query: { quizId: opts.quizId, quizUrl: opts.quizUrl },
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

async function seedQuiz(overrides: Record<string, unknown> = {}) {
  await testDb()
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
      subjectName: SUBJECT,
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
      ...overrides,
    });
}

async function seedProblem(problemId: string, order: number, title: string) {
  await testDb()
    .collection("quizzes")
    .doc(QUIZ_ID)
    .collection("problems")
    .doc(problemId)
    .set({
      order,
      title,
      description: "",
      initialCode: "",
      maxRuns: null,
      pointsTotal: 20,
      updatedAt: ts(0),
      deletedAt: null,
    });
}

async function seedParticipant(overrides: Record<string, unknown>) {
  const studentId = overrides.studentId as string;
  await testDb()
    .collection("participants")
    .doc(`${QUIZ_ID}_${studentId}`)
    .set({
      quizId: QUIZ_ID,
      enteredAt: ts(-50_000),
      finalStatus: "IN_PROGRESS",
      finalSubmittedAt: null,
      finalTotal: 0,
      runsUsedByProblem: {},
      submissions: {},
      runResults: {},
      gradePushedAt: null,
      ...overrides,
    });
}

describe("exportQuizResultToSheet", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("토큰이 없거나 틀리면 unauthorized를 반환한다", async () => {
    await seedQuiz();
    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: "wrong", quizId: QUIZ_ID }), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "unauthorized" });
  });

  it("quizId와 quizUrl이 둘 다 없으면 오류를 반환한다", async () => {
    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: TOKEN }), res as never);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "quizId 또는 quizUrl이 필요합니다.",
    });
  });

  it("존재하지 않는 quizId면 오류를 반환한다", async () => {
    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: TOKEN, quizId: "no-such-quiz" }), res as never);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "퀴즈를 찾을 수 없습니다." });
  });

  it("FINALIZED 참가자의 문항별/테스트케이스별 점수를 문항 order 순서로 콤마 이어붙여 반환한다", async () => {
    await seedQuiz();
    await seedProblem("p2", 1, "2번");
    await seedProblem("p1", 0, "1번");
    await seedParticipant({
      studentId: "20240001",
      finalStatus: "FINALIZED",
      finalSubmittedAt: ts(-10_000),
      finalTotal: 15,
      runResults: {
        p1: {
          status: "WA",
          score: 5,
          maxScore: 20,
          compileErrorMessage: null,
          tcResults: [
            { tcId: "tc-1", passed: true, isPublic: true, points: 5 },
            { tcId: "tc-2", passed: false, isPublic: false, points: 15 },
          ],
        },
        p2: {
          status: "AC",
          score: 10,
          maxScore: 10,
          compileErrorMessage: null,
          tcResults: [{ tcId: "tc-3", passed: true, isPublic: true, points: 10 }],
        },
      },
    });

    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: TOKEN, quizId: QUIZ_ID }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0]![0];
    expect(body.ok).toBe(true);
    expect(body.rows[0]).toEqual([
      "제출시각",
      "이름",
      "학번",
      "과목명",
      "퀴즈명",
      "상태",
      "총점",
      "문항별 점수",
      "문항별 테스트케이스 점수",
    ]);
    expect(body.rows).toHaveLength(2);
    const row = body.rows[1];
    // courseId가 없는 퀴즈는 명부가 없어 이름을 알 수 없으므로 studentId를 이름으로 쓴다
    // (getParticipantOverviewData의 기존 동작 그대로).
    expect(row[1]).toBe("20240001");
    expect(row[2]).toBe("20240001");
    expect(row[3]).toBe(SUBJECT);
    expect(row[4]).toBe("중간고사");
    expect(row[5]).toBe("채점완료");
    expect(row[6]).toBe("15");
    expect(row[7]).toBe("5,10"); // p1(order 0) 점수, p2(order 1) 점수 — order 순서
    expect(row[8]).toBe("5,0,10"); // p1의 TC 2개(5,0), p2의 TC 1개(10) — order 순서로 이어붙임
  });

  it("SUBMITTED(아직 미채점) 참가자는 총점/문항별 점수/TC 점수가 모두 빈 문자열이다", async () => {
    await seedQuiz();
    await seedProblem("p1", 0, "1번");
    await seedParticipant({
      studentId: "20240002",
      finalStatus: "SUBMITTED",
      finalSubmittedAt: ts(-5_000),
    });

    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: TOKEN, quizId: QUIZ_ID }), res as never);

    const body = res.json.mock.calls[0]![0];
    const row = body.rows[1];
    expect(row[5]).toBe("제출완료");
    expect(row[6]).toBe("");
    expect(row[7]).toBe("");
    expect(row[8]).toBe("");
  });

  it("Classroom 연동 퀴즈의 미입장 수강생은 상태만 채우고 나머지 칸은 빈 문자열이다", async () => {
    await seedQuiz({ courseId: "course-1" });
    await seedProblem("p1", 0, "1번");
    await testDb().collection("rosters").doc("course-1_20240003").set({
      courseId: "course-1",
      studentId: "20240003",
      name: "박영희",
      email: "20240003@hoseo.edu",
      syncedAt: FieldValue.serverTimestamp(),
    });

    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: TOKEN, quizId: QUIZ_ID }), res as never);

    const body = res.json.mock.calls[0]![0];
    const row = body.rows.find((r: string[]) => r[2] === "20240003")!;
    expect(row[1]).toBe("박영희");
    expect(row[5]).toBe("미입장");
    expect(row[0]).toBe("");
    expect(row[6]).toBe("");
    expect(row[7]).toBe("");
    expect(row[8]).toBe("");
  });

  it("quizUrl로 호출해도 quizId와 동일하게 동작한다", async () => {
    await seedQuiz();
    await seedParticipant({
      studentId: "20240001",
      finalStatus: "FINALIZED",
      finalSubmittedAt: ts(-10_000),
      finalTotal: 0,
    });

    const res = makeRes();
    await exportQuizResultToSheet(
      makeReq({ token: TOKEN, quizUrl: `https://example.web.app/quiz/${QUIZ_ID}` }),
      res as never,
    );

    const body = res.json.mock.calls[0]![0];
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[1][2]).toBe("20240001");
  });
});
