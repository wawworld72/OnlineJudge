import { describe, expect, it } from "vitest";
import { computeFinalTotal } from "../../src/services/scoreAggregation";
import type { RunResult } from "../../src/models/types";

function result(score: number, maxScore: number): RunResult {
  return { status: "AC", score, maxScore, compileErrorMessage: null, tcResults: [] };
}

describe("computeFinalTotal", () => {
  it("문항별 score를 합산한다", () => {
    expect(computeFinalTotal({ p1: result(60, 60), p2: result(30, 40) })).toBe(90);
  });

  it("runResults가 비어있으면 0을 반환한다", () => {
    expect(computeFinalTotal({})).toBe(0);
  });

  it("maxScore가 아니라 score만 합산한다(만점을 그대로 더하지 않음)", () => {
    expect(computeFinalTotal({ p1: result(0, 100) })).toBe(0);
  });
});
