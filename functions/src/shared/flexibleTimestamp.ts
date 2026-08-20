import { Timestamp } from "firebase-admin/firestore";

/**
 * `upsertQuizFromSheet`는 Google Apps Script가 보내는 날짜를 받는다 — 스프레드시트 셀이
 * epoch millis 숫자로 오든 ISO 8601 문자열로 오든(둘 다 GAS에서 손쉽게 만들 수 있다)
 * 그대로 받아 Firestore `Timestamp`로 변환한다.
 */
export function parseFlexibleTimestamp(value: number | string): Timestamp {
  if (typeof value === "number") {
    return Timestamp.fromMillis(value);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${value}`);
  }
  return Timestamp.fromMillis(parsed);
}
