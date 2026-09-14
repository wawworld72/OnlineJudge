import { beforeEach, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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

  afterEach(() => {
    vi.restoreAllMocks();
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
    await testDb().collection("students").doc("20240001").set({
      name: "홍길동",
      email: "hong@hoseo.edu",
      status: "ACTIVE",
    });
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
      "이메일 주소",
      "이름",
      "학번",
      "주제",
      "과목명",
      "상태",
      "문항별 점수",
      "문항별 테스트케이스 점수",
      "총점",
    ]);
    expect(body.rows).toHaveLength(2);
    const row = body.rows[1];
    expect(row[1]).toBe("hong@hoseo.edu");
    // courseId가 없는 퀴즈는 명부가 없어 이름을 알 수 없으므로 studentId를 이름으로 쓴다
    // (getParticipantOverviewData의 기존 동작 그대로 — students.name은 쓰지 않음).
    expect(row[2]).toBe("20240001");
    expect(row[3]).toBe("20240001");
    expect(row[4]).toBe("중간고사");
    expect(row[5]).toBe(SUBJECT);
    expect(row[6]).toBe("채점완료");
    expect(row[7]).toBe("5,10"); // p1(order 0) 점수, p2(order 1) 점수 — order 순서
    expect(row[8]).toBe("5,0,10"); // p1의 TC 2개(5,0), p2의 TC 1개(10) — order 순서로 이어붙임
    expect(row[9]).toBe("15");
  });

  it("SUBMITTED(미채점) 참가자는 내보내기 시점에 자동으로 채점되어 확정된다(제출한 코드가 없으면 0점)", async () => {
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
    // batchGrade를 따로 호출하지 않았지만, 내보내기 자체가 자동으로 채점을 수행해
    // 미제출 문항은 NOT_ATTEMPTED 0점으로 확정한다(기존에는 "제출완료"로만 남고
    // 점수 칸이 비어 있었던 버그).
    expect(row[6]).toBe("채점완료");
    expect(row[7]).toBe("0"); // 문항별 점수
    expect(row[8]).toBe(""); // TC를 채점하지 않았으므로 TC별 점수는 없음
    expect(row[9]).toBe("0"); // 총점

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_20240002`).get()
    ).data()!;
    expect(participant.finalStatus).toBe("FINALIZED");
  });

  it("SUBMITTED + 실제 제출 코드가 있는 참가자는 내보내기 시점에 자동 채점되어 실제 점수가 채워진다", async () => {
    await seedQuiz();
    await seedProblem("p1", 0, "1번");
    await testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .collection("problemSecrets")
      .doc("p1")
      .set({
        items: [
          {
            tcId: "tc-1",
            tcNo: 1,
            input: "1",
            expected: "1",
            points: 20,
            isPublic: true,
            description: "",
          },
        ],
        updatedAt: FieldValue.serverTimestamp(),
      });
    await seedParticipant({
      studentId: "20240003",
      finalStatus: "SUBMITTED",
      finalSubmittedAt: ts(-5_000),
      submissions: { p1: { code: "int main(){}", submittedAt: Timestamp.now() } },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        status: "JUDGED",
        score: 20,
        maxScore: 20,
        compileErrorMessage: null,
        tcResultsFull: [
          {
            result: "✅PASS",
            earned: 1,
            isPublic: true,
            input: "1",
            expected: "1",
            actual: "1",
            memo: "",
          },
        ],
      }),
    } as Response);

    const res = makeRes();
    await exportQuizResultToSheet(makeReq({ token: TOKEN, quizId: QUIZ_ID }), res as never);

    const body = res.json.mock.calls[0]![0];
    const row = body.rows.find((r: string[]) => r[3] === "20240003")!;
    expect(row[6]).toBe("채점완료");
    expect(row[7]).toBe("20"); // 문항별 점수
    expect(row[8]).toBe("20"); // TC별 점수
    expect(row[9]).toBe("20"); // 총점

    const participant = (
      await testDb().collection("participants").doc(`${QUIZ_ID}_20240003`).get()
    ).data()!;
    expect(participant.finalStatus).toBe("FINALIZED");
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
    const row = body.rows.find((r: string[]) => r[3] === "20240003")!;
    expect(row[1]).toBe("20240003@hoseo.edu"); // 명부(rosters)의 email
    expect(row[2]).toBe("박영희");
    expect(row[6]).toBe("미입장");
    expect(row[0]).toBe(""); // 제출시각
    expect(row[7]).toBe(""); // 문항별 점수
    expect(row[8]).toBe(""); // 문항별 테스트케이스 점수
    expect(row[9]).toBe(""); // 총점
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
    expect(body.rows[1][3]).toBe("20240001");
  });
});
