import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_FOCUS_STATE,
  onAcknowledge,
  onLeave,
  onReturn,
  onTick,
  type FocusGuardState,
} from "./focusGuardState";

const AWAY_TITLE = "⚠ 시험 화면으로 돌아오세요";
const TICK_MS = 500;
/** 1단계 경고는 복귀 후 이 시간이 지나면 저절로 사라진다(2단계는 확인 버튼이 필요). */
const STAGE1_AUTO_DISMISS_MS = 6000;

interface UseFocusGuardOptions {
  /** 켜져 있을 때만 감지한다(퀴즈 토글 && 응시 중 && 마감 전 && 테스트 참가자 아님). */
  enabled: boolean;
  /** 복귀 시 이탈 길이(ms)를 서버에 보고한다 — 실패해도 응시는 계속되므로 호출부가 삼킨다. */
  onReport: (durationMs: number) => void;
}

/**
 * 브라우저 탭/창 이탈을 감지해 단계(0/1/2)를 돌려준다. 완전한 차단이 아니라 억제책이다 —
 * 개발자 도구 등으로 우회할 수 있다. 단계 판정은 `focusGuardState.ts`의 순수 함수가 한다.
 */
export function useFocusGuard({ enabled, onReport }: UseFocusGuardOptions) {
  const [state, setState] = useState<FocusGuardState>(INITIAL_FOCUS_STATE);
  const stateRef = useRef(state);
  const reportRef = useRef(onReport);
  useEffect(() => {
    reportRef.current = onReport;
  }, [onReport]);

  const update = useCallback((next: FocusGuardState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const originalTitle = document.title;

    const handleLeave = () => {
      update(onLeave(stateRef.current, Date.now()));
      document.title = AWAY_TITLE;
    };
    const handleReturn = () => {
      const result = onReturn(stateRef.current, Date.now());
      update(result.state);
      document.title = originalTitle;
      if (result.durationMs !== null) reportRef.current(result.durationMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleLeave();
      else if (document.hasFocus()) handleReturn();
    };

    window.addEventListener("blur", handleLeave);
    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", onVisibility);
    const tick = window.setInterval(() => {
      const next = onTick(stateRef.current, Date.now());
      if (next !== stateRef.current) update(next);
    }, TICK_MS);

    return () => {
      window.removeEventListener("blur", handleLeave);
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(tick);
      document.title = originalTitle;
      // 비활성화되거나 화면이 사라지면 남은 경고 상태를 비운다.
      update(INITIAL_FOCUS_STATE);
    };
  }, [enabled, update]);

  // 1단계는 복귀 후 잠시 뒤 자동으로 닫는다.
  useEffect(() => {
    if (state.stage !== 1 || state.away) return;
    const timer = window.setTimeout(() => update(onAcknowledge()), STAGE1_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [state, update]);

  const acknowledge = useCallback(() => {
    if (!stateRef.current.away) update(onAcknowledge());
  }, [update]);

  return { stage: enabled ? state.stage : 0, away: state.away, acknowledge };
}
