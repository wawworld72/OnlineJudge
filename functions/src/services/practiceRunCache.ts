import { createHash } from "node:crypto";
import type { RunResult } from "../models/types";

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result: RunResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 연습 실행 결과 캐시(FR-016, research.md §13). 캐시 키에 문항의 `updatedAt`(밀리초)을 포함해
 * 테스트케이스가 바뀌면 이전 코드의 캐시도 자동으로 무효화된다 — TTL(5분)은 메모리 사용량을
 * 줄이는 성능 파라미터일 뿐이고, 정확성은 키 구성 자체가 보장한다.
 */
export function makeCacheKey(
  quizId: string,
  problemId: string,
  code: string,
  problemUpdatedAtMillis: number,
): string {
  const codeHash = createHash("sha256").update(code).digest("hex");
  return `${quizId}:${problemId}:${codeHash}:${problemUpdatedAtMillis}`;
}

export function getCached(key: string): RunResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

/** `SYSTEM_ERROR`는 호출자가 절대 이 함수로 캐시하지 않아야 한다(grader-api.md). */
export function setCached(key: string, result: RunResult): void {
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
}
