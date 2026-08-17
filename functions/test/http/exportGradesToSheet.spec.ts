import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { clearFirestore, teardownTestApp, testDb, ts } from "../testEnv";
import { exportGradesToSheet } from "../../src/http/exportGradesToSheet";

const QUIZ_ID = "quiz-1";
const TOKEN = process.env.SHEET_EXPORT_API_TOKEN!;

function makeReq(opts: { token?: string; quizId?: string }) {
  return {
    get: (name: string) => (name === "Authorization" && opts.token ? `Bearer ${opts.token}` : undefined),
    query: { quizId: opts.quizId },
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

async function seedQuiz() {
  await testDb().collection("quizzes").doc(QUIZ_ID).set({
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
}

describe("exportGradesToSheet", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("토큰이 없거나 틀리면 unauthorized를 반환한다", async () => {
    await seedQuiz();
    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: "wrong", quizId: QUIZ_ID }), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "unauthorized" });
  });

  it("quizId가 없으면 오류를 반환한다", async () => {
    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: TOKEN }), res as never);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "quizId가 필요합니다." });
  });

  it("존재하지 않는 퀴즈면 오류를 반환한다", async () => {
    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: TOKEN, quizId: "nope" }), res as never);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "존재하지 않는 퀴즈입니다." });
  });

  it("토큰과 quizId가 맞으면 학번/이름/상태/제출시각/확정점수 행을 반환한다", async () => {
    await seedQuiz();
    await testDb()
      .collection("participants")
      .doc(`${QUIZ_ID}_20240001`)
      .set({
        quizId: QUIZ_ID,
        studentId: "20240001",
        enteredAt: ts(-50_000),
        finalStatus: "FINALIZED",
        finalSubmittedAt: ts(-10_000),
        finalTotal: 90,
        runsUsedByProblem: {},
        submissions: {},
        runResults: {},
        gradePushedAt: null,
      });

    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: TOKEN, quizId: QUIZ_ID }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0]![0];
    expect(body.ok).toBe(true);
    expect(body.sheetName).toBe("성적결과");
    expect(body.rows[0]).toEqual(["학번", "이름", "상태", "제출시각", "확정점수"]);
    expect(body.rows[1][0]).toBe("20240001");
    expect(body.rows[1][2]).toBe("채점완료");
    expect(body.rows[1][4]).toBe("90");
  });
});
