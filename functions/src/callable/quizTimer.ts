import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import {
  endQuizTimerSchema,
  pauseQuizTimerSchema,
  setQuizTimerDurationSchema,
  startQuizTimerSchema,
} from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import { computePreDeployCheck } from "../services/preDeployCheck";
import { DEFAULT_TIMER_DURATION_MS, type Quiz } from "../models/types";

/**
 * 퀴즈 목록 화면에서 교사가 즉석으로 시험 시간을 통제하는 타이머 콜러블 4종.
 * "최종 제출 마감"은 별도 콜러블 없이 기존 `setQuizStatus({status:"CLOSED"})`를
 * 그대로 재사용한다(순서 강제 없이 목표 상태를 그대로 반영하므로 충분).
 */
export const setQuizTimerDuration = createCallable(
  setQuizTimerDurationSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    await getFirestore()
      .collection("quizzes")
      .doc(data.quizId)
      .update({ timerDurationMs: data.timerDurationMs });
    return { timerDurationMs: data.timerDurationMs };
  },
);

export const startQuizTimer = createCallable(startQuizTimerSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  if (quiz.status === "CLOSED") {
    throw domainError("QUIZ_CLOSED", "이미 마감된 퀴즈입니다.");
  }
  if (quiz.status === "OPEN" && !quiz.pausedAt) {
    throw domainError("TIMER_ALREADY_RUNNING", "이미 타이머가 실행 중입니다.");
  }

  const now = Timestamp.now();

  if (quiz.pausedAt) {
    // 재개: 멈춰있던 시간만큼 종료 시각을 뒤로 늦춘다.
    const pausedMs = now.toMillis() - quiz.pausedAt.toMillis();
    await quizRef.update({
      endAt: Timestamp.fromMillis(quiz.endAt.toMillis() + pausedMs),
      pausedAt: null,
    });
    return { status: "OPEN" as const };
  }

  // 최초 시작(DRAFT) — setQuizStatus의 OPEN 전환과 동일한 사전점검을 재사용한다.
  const { blockingCount } = await computePreDeployCheck(db, data.quizId);
  if (blockingCount > 0) {
    throw domainError(
      "BLOCKED_BY_PREDEPLOY_CHECK",
      "배포 전 점검을 통과하지 못해 시작할 수 없습니다.",
    );
  }

  const durationMs = quiz.timerDurationMs ?? DEFAULT_TIMER_DURATION_MS;
  await quizRef.update({
    status: "OPEN",
    startAt: now,
    endAt: Timestamp.fromMillis(now.toMillis() + durationMs),
    pausedAt: null,
  });
  return { status: "OPEN" as const };
});

export const pauseQuizTimer = createCallable(pauseQuizTimerSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  if (quiz.status !== "OPEN" || quiz.pausedAt) {
    throw domainError("TIMER_NOT_RUNNING", "지금은 일시정지할 수 없습니다.");
  }
  await quizRef.update({ pausedAt: Timestamp.now() });
  return { ok: true as const };
});

export const endQuizTimer = createCallable(endQuizTimerSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  if (quiz.status !== "OPEN") {
    throw domainError("TIMER_NOT_RUNNING", "지금은 종료할 수 없습니다.");
  }
  await quizRef.update({ endAt: Timestamp.now(), pausedAt: null });
  return { ok: true as const };
});
