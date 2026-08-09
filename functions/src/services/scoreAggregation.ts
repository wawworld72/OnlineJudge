import type { RunResult } from "../models/types";

/**
 * 참가자의 확정 총점을 문항별 `RunResult.score`(이미 문항 배점 기준으로 서버가 재계산한
 * 값, `graderClient.grade` 참고)의 합으로 계산한다 — Grader가 준 원본 `score`/`maxScore`를
 * 그대로 누적하지 않는다(헌법 원칙 I, contracts/grader-api.md).
 */
export function computeFinalTotal(runResults: Record<string, RunResult>): number {
  return Object.values(runResults).reduce((sum, result) => sum + result.score, 0);
}
