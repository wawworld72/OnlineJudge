import type { Participant, Quiz } from "../models/types";

/**
 * 퀴즈 전체에서 허용되는 연습 실행 총 횟수. 예전 퀴즈 문서는 `maxRunsPerProblem`만
 * 갖고 있으므로(문항당 한도였던 시절의 값) 새 필드가 없으면 그 값을 그대로 총 한도로 쓴다.
 */
export function getQuizMaxRuns(quiz: Pick<Quiz, "maxRunsTotal" | "maxRunsPerProblem">): number {
  return quiz.maxRunsTotal ?? quiz.maxRunsPerProblem ?? 0;
}

/** 참가자가 이 퀴즈에서 지금까지 사용한 연습 실행 총 횟수(문항별 사용량의 합). */
export function getRunsUsedTotal(participant: Pick<Participant, "runsUsedByProblem">): number {
  return Object.values(participant.runsUsedByProblem).reduce((sum, n) => sum + n, 0);
}
