import { HttpsError } from "firebase-functions/v2/https";

/**
 * 교사용 Callable Function 공통 진입 가드. 모든 "교사용" 함수(contracts/
 * callable-functions.md)는 핸들러 시작에서 이 검사를 통과해야 한다 — App Check와 로그인
 * 여부만으로는 "이 로그인 사용자가 교사인가"를 판별하지 못하기 때문이다(헌법 I).
 * `isTeacher`는 `teacherLogin`이 출입코드 검증 후 부여한 커스텀 클레임(`teacher: true`)
 * 유무로만 판별한다(callableFactory) — 이메일 허용목록은 더는 쓰지 않는다.
 */
export function requireTeacher(isTeacher: boolean): void {
  if (!isTeacher) {
    throw new HttpsError("permission-denied", "교사 권한이 필요합니다.");
  }
}
