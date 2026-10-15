import { describe, expect, it } from "vitest";
import {
  INITIAL_FOCUS_STATE,
  MIN_REPORT_MS,
  STAGE2_AFTER_MS,
  onAcknowledge,
  onLeave,
  onReturn,
  onTick,
} from "./focusGuardState";

describe("focusGuardState", () => {
  it("이탈하면 즉시 1단계가 된다", () => {
    const s = onLeave(INITIAL_FOCUS_STATE, 1000);
    expect(s).toEqual({ away: true, awaySince: 1000, stage: 1 });
  });

  it("이미 이탈 중이면 중복 이벤트를 무시한다", () => {
    const s = onLeave(INITIAL_FOCUS_STATE, 1000);
    expect(onLeave(s, 3000)).toBe(s);
  });

  it("이탈이 5초 이상 지속되면 2단계가 된다", () => {
    const s = onLeave(INITIAL_FOCUS_STATE, 0);
    expect(onTick(s, STAGE2_AFTER_MS - 1).stage).toBe(1);
    expect(onTick(s, STAGE2_AFTER_MS).stage).toBe(2);
  });

  it("복귀하면 이탈 길이를 돌려주고 단계는 확인 전까지 유지된다", () => {
    const left = onLeave(INITIAL_FOCUS_STATE, 0);
    const { state, durationMs } = onReturn(left, 2000);
    expect(durationMs).toBe(2000);
    expect(state).toEqual({ away: false, awaySince: null, stage: 1 });
  });

  it("타이머가 돌지 못한 채 5초 이상 지나 복귀해도 2단계로 확정한다", () => {
    const left = onLeave(INITIAL_FOCUS_STATE, 0);
    expect(onReturn(left, 20_000).state.stage).toBe(2);
  });

  it("아주 짧은 포커스 변화는 이탈로 보지 않는다", () => {
    const left = onLeave(INITIAL_FOCUS_STATE, 0);
    const result = onReturn(left, MIN_REPORT_MS - 1);
    expect(result.durationMs).toBeNull();
    expect(result.state).toEqual(INITIAL_FOCUS_STATE);
  });

  it("이탈 중이 아닐 때의 복귀는 아무 일도 하지 않는다", () => {
    const result = onReturn(INITIAL_FOCUS_STATE, 5000);
    expect(result.durationMs).toBeNull();
    expect(result.state).toBe(INITIAL_FOCUS_STATE);
  });

  it("확인하면 초기 상태로 돌아간다", () => {
    expect(onAcknowledge()).toEqual(INITIAL_FOCUS_STATE);
  });
});
