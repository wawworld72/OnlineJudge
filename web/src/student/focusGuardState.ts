/**
 * 화면 이탈 감지의 단계 판정 로직(순수 함수). 브라우저 이벤트 연결은 `useFocusGuard.ts`가
 * 맡고, 여기서는 "언제 몇 단계인가"만 계산해 테스트할 수 있게 한다.
 *
 * - 1단계: 이탈 즉시 경고
 * - 2단계: 한 번의 이탈이 STAGE2_AFTER_MS 이상 지속(화면 전체 주황색)
 * 복귀 시 이탈 길이를 돌려줘 서버에 보고한다. MIN_REPORT_MS 미만의 아주 짧은 포커스
 * 변화(파일 선택창·알림 등)는 이탈로 보지 않고 조용히 되돌린다.
 */
export const STAGE2_AFTER_MS = 5000;
export const MIN_REPORT_MS = 500;

export type FocusStage = 0 | 1 | 2;

export interface FocusGuardState {
  away: boolean;
  awaySince: number | null;
  stage: FocusStage;
}

export const INITIAL_FOCUS_STATE: FocusGuardState = { away: false, awaySince: null, stage: 0 };

export function onLeave(state: FocusGuardState, now: number): FocusGuardState {
  if (state.away) return state; // blur와 visibilitychange가 함께 와도 한 번만 센다
  return { away: true, awaySince: now, stage: Math.max(state.stage, 1) as FocusStage };
}

export function onTick(state: FocusGuardState, now: number): FocusGuardState {
  if (!state.away || state.awaySince === null || state.stage >= 2) return state;
  return now - state.awaySince >= STAGE2_AFTER_MS ? { ...state, stage: 2 } : state;
}

export function onReturn(
  state: FocusGuardState,
  now: number,
): { state: FocusGuardState; durationMs: number | null } {
  if (!state.away || state.awaySince === null) return { state, durationMs: null };
  const durationMs = Math.max(0, now - state.awaySince);
  if (durationMs < MIN_REPORT_MS) {
    return { state: INITIAL_FOCUS_STATE, durationMs: null };
  }
  // 백그라운드 탭은 타이머가 늦게 돌 수 있어, 복귀 시점에 길이로 2단계를 확정한다.
  const stage: FocusStage =
    durationMs >= STAGE2_AFTER_MS ? 2 : (Math.max(state.stage, 1) as FocusStage);
  return { state: { away: false, awaySince: null, stage }, durationMs };
}

export function onAcknowledge(): FocusGuardState {
  return INITIAL_FOCUS_STATE;
}
