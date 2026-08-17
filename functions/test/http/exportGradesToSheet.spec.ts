import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { clearFirestore, teardownTestApp, testDb, ts } from "../testEnv";
import { exportGradesToSheet } from "../../src/http/exportGradesToSheet";

const TOKEN = process.env.SHEET_EXPORT_API_TOKEN!;
const SUBJECT = "컴퓨터프로그래밍심화";

function makeReq(opts: { token?: string; subject?: string }) {
  return {
    get: (name: string) => (name === "Authorization" && opts.token ? `Bearer ${opts.token}` : undefined),
    query: { subject: opts.subject },
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

async function seedQuiz(quizId: string, title: string) {
  await testDb().collection("quizzes").doc(quizId).set({
    subjectName: SUBJECT,
    title,
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

function findTab(tabs: Array<{ sheetName: string; rows: string[][] }>, sheetName: string) {
  return tabs.find((t) => t.sheetName === sheetName)!;
}

describe("exportGradesToSheet", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("토큰이 없거나 틀리면 unauthorized를 반환한다", async () => {
    await seedQuiz("quiz-1", "중간고사");
    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: "wrong", subject: SUBJECT }), res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "unauthorized" });
  });

  it("subject가 없으면 오류를 반환한다", async () => {
    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: TOKEN }), res as never);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "subject가 필요합니다." });
  });

  it("해당 과목명의 퀴즈가 없으면 오류를 반환한다", async () => {
    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: TOKEN, subject: "없는과목" }), res as never);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "해당 과목명의 퀴즈를 찾을 수 없습니다.",
    });
  });

  it("같은 과목명의 퀴즈 여러 개를 묶어 성적결과/문항별_TC결과 두 탭으로 반환한다", async () => {
    await seedQuiz("quiz-1", "중간고사");
    await seedQuiz("quiz-2", "기말고사");
    await testDb().collection("quizzes").doc("quiz-1").collection("problems").doc("p1").set({
      order: 0,
      title: "레벨업",
      description: "",
      initialCode: "",
      maxRuns: null,
      pointsTotal: 20,
      updatedAt: ts(0),
      deletedAt: null,
    });
    await testDb()
      .collection("participants")
      .doc("quiz-1_20240001")
      .set({
        quizId: "quiz-1",
        studentId: "20240001",
        enteredAt: ts(-50_000),
        finalStatus: "FINALIZED",
        finalSubmittedAt: ts(-10_000),
        finalTotal: 10,
        runsUsedByProblem: {},
        submissions: {},
        runResults: {
          p1: {
            status: "WA",
            score: 10,
            maxScore: 20,
            compileErrorMessage: null,
            tcResults: [
              { tcId: "tc-1", passed: true, isPublic: true, points: 10 },
              { tcId: "tc-2", passed: false, isPublic: false, points: 10 },
            ],
          },
        },
        gradePushedAt: null,
      });
    await testDb()
      .collection("participants")
      .doc("quiz-2_20240001")
      .set({
        quizId: "quiz-2",
        studentId: "20240001",
        enteredAt: ts(-50_000),
        finalStatus: "IN_PROGRESS",
        finalSubmittedAt: null,
        finalTotal: 0,
        runsUsedByProblem: {},
        submissions: {},
        runResults: {},
        gradePushedAt: null,
      });

    const res = makeRes();
    await exportGradesToSheet(makeReq({ token: TOKEN, subject: SUBJECT }), res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0]![0];
    expect(body.ok).toBe(true);
    expect(body.tabs).toHaveLength(2);

    const detail = findTab(body.tabs, "문항별_TC결과");
    expect(detail.rows[0]).toEqual(["이름", "학번", "과목명", "퀴즈명", "문항명", "TC", "획득 점수"]);
    expect(detail.rows).toHaveLength(3); // 헤더 + TC 2개(중간고사만 runResults 있음)
    expect(detail.rows).toContainEqual([
      "20240001",
      "20240001",
      SUBJECT,
      "중간고사",
      "레벨업",
      "1",
      "10",
    ]);
    expect(detail.rows).toContainEqual([
      "20240001",
      "20240001",
      SUBJECT,
      "중간고사",
      "레벨업",
      "2",
      "0",
    ]);

    const summary = findTab(body.tabs, "성적결과");
    expect(summary.rows[0]).toEqual(["이름", "학번", "과목명", "퀴즈명", "상태", "제출시각", "확정점수"]);
    expect(summary.rows).toHaveLength(3); // 헤더 + quiz-1 참가자 1명 + quiz-2 참가자 1명
    const midterm = summary.rows.find((r) => r[3] === "중간고사")!;
    expect(midterm[4]).toBe("채점완료");
    expect(midterm[6]).toBe("10");
    const final = summary.rows.find((r) => r[3] === "기말고사")!;
    expect(final[4]).toBe("응시중");
  });
});
