import { HttpsError } from "firebase-functions/v2/https";
import { getTeacherEmails } from "../config";

/**
 * 교사용 Callable Function 공통 진입 가드. 모든 "교사용" 함수(contracts/
 * callable-functions.md)는 핸들러 시작에서 이 검사를 통과해야 한다 — App Check와 로그인
 * 여부만으로는 "이 로그인 사용자가 교사인가"를 판별하지 못하기 때문이다(헌법 I).
 */
export function requireTeacher(authEmail: string): void {
  if (!getTeacherEmails().includes(authEmail)) {
    throw new HttpsError("permission-denied", "교사 권한이 필요합니다.");
  }
}
