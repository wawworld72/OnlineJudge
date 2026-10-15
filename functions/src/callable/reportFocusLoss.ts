import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { reportFocusLossSchema } from "../shared/schemas";
import { resolveStudentIdByEmail } from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import type { Participant, Quiz } from "../models/types";

/** 참가자 문서에 남기는 상세 이탈 이벤트 개수 상한 — 이를 넘으면 횟수·누적 시간만 반영한다. */
export const FOCUS_LOSS_EVENTS_MAX = 50;

/**
 * 학생이 응시 화면을 벗어났다가 돌아왔을 때 클라이언트가 한 번 보고하는 이탈 기록. 이
 * 기록은 교사 확인용 증거일 뿐 어떤 차단·감점도 하지 않는다(브라우저 JS 기반 억제책).
 * 서버가 신뢰할 수 있는 값만 쓰도록 시각은 서버 시각을 쓰고 이탈 길이는 0~남은 응시
 * 시간으로 제한한다. 응시 중이 아니거나 교사 테스트 참가자이거나 퀴즈에서 기능이 꺼져
 * 있으면 조용히 무시한다(`recorded: false`).
 */
export const reportFocusLoss = createCallable(
  reportFocusLossSchema,
  async ({ data, authEmail }) => {
    const db = getFirestore();
    const studentId = await resolveStudentIdByEmail(db, authEmail);

    const quizSnap = await db.collection("quizzes").doc(data.quizId).get();
    if (!quizSnap.exists) return { recorded: false };
    const quiz = quizSnap.data() as Quiz;
    if (quiz.focusGuardEnabled === false) return { recorded: false };

    const participantRef = db
      .collection("participants")
      .doc(computeParticipantId(data.quizId, studentId));

    // 이탈 길이 상한: 퀴즈 종료 시각(+최종 제출 유예 여유)까지 남은 시간 이내로 제한한다.
    const maxDurationMs = Math.max(0, quiz.endAt.toMillis() + 5 * 60 * 1000 - Date.now());
    const durationMs = Math.min(Math.round(data.durationMs), maxDurationMs);

    const recorded = await db.runTransaction(async (tx) => {
      const snap = await tx.get(participantRef);
      if (!snap.exists) return false;
      const participant = snap.data() as Participant;
      if (participant.finalStatus !== "IN_PROGRESS" || participant.isTestEntry) return false;

      const events = participant.focusLossEvents ?? [];
      const now = Timestamp.now();
      const update: Record<string, unknown> = {
        focusLossCount: FieldValue.increment(1),
        focusLossTotalMs: FieldValue.increment(durationMs),
        lastFocusLossAt: now,
      };
      if (events.length < FOCUS_LOSS_EVENTS_MAX) {
        update.focusLossEvents = [...events, { at: now, durationMs }];
      }
      tx.update(participantRef, update);
      return true;
    });

    return { recorded };
  },
);
