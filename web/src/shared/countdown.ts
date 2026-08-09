/**
 * 서버가 준 종료시각(`endAt`, epoch ms) 기준으로 클라이언트에서 로컬 카운트다운만 계산한다.
 * Firestore `onSnapshot` 구독은 쓰지 않는다(헌법 IV — 서버 쓰기/구독 비용 최소화, 헌법 VII —
 * 실제 마감 판단은 항상 서버가 재검증하므로 이 값은 UX 표시용일 뿐이다).
 */
export function remainingMillis(endAtMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, endAtMs - nowMs);
}

export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function startCountdown(
  endAtMs: number,
  onTick: (remainingMs: number) => void,
  intervalMs = 1000,
): () => void {
  onTick(remainingMillis(endAtMs));
  const timer = setInterval(() => {
    onTick(remainingMillis(endAtMs));
  }, intervalMs);
  return () => clearInterval(timer);
}
