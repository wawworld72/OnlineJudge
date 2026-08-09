import { Timestamp } from "firebase-admin/firestore";

/**
 * 모든 시간 판단은 서버 기준 시각(`Timestamp.now()`)으로만 수행한다(헌법 VII) — 클라이언트가
 * 보낸 시각 문자열은 절대 신뢰하지 않는다. 브라우저 시계 조작으로 응시 가능 여부를 속일 수
 * 없도록 하기 위함이다.
 */
export function serverNow(): Timestamp {
  return Timestamp.now();
}

export function isBefore(startAt: Timestamp): boolean {
  return serverNow().toMillis() < startAt.toMillis();
}

export function isAfter(endAt: Timestamp): boolean {
  return serverNow().toMillis() > endAt.toMillis();
}

export function isWithin(startAt: Timestamp, endAt: Timestamp): boolean {
  return !isBefore(startAt) && !isAfter(endAt);
}
