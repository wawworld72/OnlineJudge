/**
 * 학생 기기 시계는 서버와 몇 초~몇 분 어긋나 있을 수 있다 — 카운트다운을 각자의
 * `Date.now()`로만 계산하면 같은 마감 시각인데도 화면에 보이는 남은 시간이
 * 학생마다 달라 보인다(실제 마감 판정은 항상 서버가 재검증하므로 공정성 자체엔
 * 문제가 없지만, 표시가 다르면 혼란·이의 제기의 원인이 된다).
 *
 * 이미 한 번 실행되는 `enterQuiz` 응답에 서버 시각(`serverNow`)을 함께 실어 보내고,
 * 그 순간의 오프셋(서버 시각 - 로컬 시각)만 계산해두면 추가 호출·구독 없이 그 뒤
 * 카운트다운 전부를 "서버 기준 지금"으로 계산할 수 있다. 기기 시계가 세션 중간에
 * 다시 크게 틀어지는 경우까지는 보정하지 않는다 — 몇 초 오차는 허용 범위로 합의됨.
 */
let clockOffsetMs = 0;

export function setClockOffset(serverNowMs: number): void {
  clockOffsetMs = serverNowMs - Date.now();
}

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}
