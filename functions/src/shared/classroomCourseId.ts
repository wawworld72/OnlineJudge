/**
 * Google Classroom 강의 URL(`classroom.google.com/c/<값>`)의 `<값>` 부분은 실제
 * courseId를 URL-safe Base64로 인코딩한 문자열이다 — Classroom API의 `courseId`
 * 파라미터는 그 안에 담긴 원본 숫자 ID를 기대하므로, URL에서 그대로 복사해 붙여넣은
 * 값은 API가 그대로 받아주지 않는다(교사가 안내대로 URL 값을 붙여넣었는데도
 * syncRoster/deployClassroomAssignment가 실패한 원인, 2026-08-12 실측 확인:
 * "ODQ0MTc0NzU1MzY1" → 디코드하면 "844174755365").
 *
 * 교사에게 "URL에서 디코드해서 넣으세요"라고 요구하는 대신, 저장 시점에 이 함수로
 * 감지해서 자동으로 원본 숫자 ID로 정규화한다 — 두 형식(원본 숫자 ID, 인코딩된 URL 값)
 * 중 어느 쪽을 붙여넣어도 동작한다.
 */
export function normalizeClassroomCourseId(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const base64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    if (/^\d+$/.test(decoded)) {
      return decoded;
    }
  } catch {
    // 디코드 실패 시 원본 값을 그대로 사용한다(아래 return).
  }

  return trimmed;
}
