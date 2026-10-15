import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { clearFirestore, makeRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { reportFocusLoss, FOCUS_LOSS_EVENTS_MAX } from "../../src/callable/reportFocusLoss";

const QUIZ_ID = "quiz-1";
const STUDENT_ID = "20240001";
const STUDENT_EMAIL = "student1@hoseo.edu";
const PARTICIPANT_PATH = `${QUIZ_ID}_${STUDENT_ID}`;

async function seed(quiz: Record<string, unknown> = {}, participant: Record<string, unknown> = {}) {
  const db = testDb();
  await db
    .collection("quizzes")
    .doc(QUIZ_ID)
    .set({
      title: "중간고사",
      description: "",
      startAt: ts(-60_000),
      endAt: ts(600_000),
      accessCode: "ABC123",
      status: "OPEN",
      maxRunsTotal: 5,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
      ...quiz,
    });
  await db.collection("students").doc(STUDENT_ID).set({
    name: "홍길동",
    email: STUDENT_EMAIL,
    status: "ACTIVE",
  });
  await db
    .collection("participants")
    .doc(PARTICIPANT_PATH)
    .set({
      quizId: QUIZ_ID,
      studentId: STUDENT_ID,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus: "IN_PROGRESS",
      finalSubmittedAt: null,
      finalTotal: 0,
      runsUsedByProblem: {},
      submissions: {},
      runResults: {},
      gradePushedAt: null,
      isTestEntry: false,
      ...participant,
    });
}

const report = (durationMs: number) =>
  reportFocusLoss.run(makeRequest({ quizId: QUIZ_ID, durationMs }, STUDENT_EMAIL));
const participantData = async () =>
  (await testDb().collection("participants").doc(PARTICIPANT_PATH).get()).data()!;

describe("reportFocusLoss", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("이탈 횟수·누적 시간·이벤트를 누적한다", async () => {
    await seed();

    expect((await report(3_000)).recorded).toBe(true);
    await report(7_000);

    const p = await participantData();
    expect(p.focusLossCount).toBe(2);
    expect(p.focusLossTotalMs).toBe(10_000);
    expect(p.focusLossEvents).toHaveLength(2);
    expect(p.focusLossEvents[1].durationMs).toBe(7_000);
    expect(p.lastFocusLossAt).toBeDefined();
  });

  it("이탈 길이를 남은 응시 시간 범위로 제한한다", async () => {
    await seed({ endAt: ts(1_000) });

    await report(999_999_999);

    const p = await participantData();
    // 종료 시각 + 최종 제출 유예(5분) 이내
    expect(p.focusLossTotalMs).toBeLessThanOrEqual(5 * 60 * 1000 + 1_000);
  });

  it("상세 이벤트는 최대 개수까지만 저장하고 횟수·누적 시간은 계속 반영한다", async () => {
    const events = Array.from({ length: FOCUS_LOSS_EVENTS_MAX }, () => ({
      at: ts(0),
      durationMs: 1,
    }));
    await seed(
      {},
      { focusLossCount: FOCUS_LOSS_EVENTS_MAX, focusLossTotalMs: 50, focusLossEvents: events },
    );

    await report(2_000);

    const p = await participantData();
    expect(p.focusLossEvents).toHaveLength(FOCUS_LOSS_EVENTS_MAX);
    expect(p.focusLossCount).toBe(FOCUS_LOSS_EVENTS_MAX + 1);
    expect(p.focusLossTotalMs).toBe(2_050);
  });

  it("이미 제출한 참가자는 기록하지 않는다", async () => {
    await seed({}, { finalStatus: "SUBMITTED" });

    expect((await report(3_000)).recorded).toBe(false);
    expect((await participantData()).focusLossCount).toBeUndefined();
  });

  it("교사 테스트 참가자는 기록하지 않는다", async () => {
    await seed({}, { isTestEntry: true });

    expect((await report(3_000)).recorded).toBe(false);
  });

  it("퀴즈에서 기능이 꺼져 있으면 기록하지 않는다", async () => {
    await seed({ focusGuardEnabled: false });

    expect((await report(3_000)).recorded).toBe(false);
    expect((await participantData()).focusLossCount).toBeUndefined();
  });

  it("focusGuardEnabled 필드가 없는 기존 퀴즈는 기록한다", async () => {
    await seed();

    expect((await report(3_000)).recorded).toBe(true);
  });
});
