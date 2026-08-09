/**
 * 외부 호출(Grader/Classroom/Sheets) 공용 1회 재시도 래퍼(헌법 VI). 첫 시도가 실패하면
 * 정확히 한 번만 다시 시도하고, 그마저 실패하면 원래 오류를 그대로 던진다 — 호출자가
 * `systemError`로 감싸 사용자에게는 일반 안내만 노출한다.
 */
export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}
