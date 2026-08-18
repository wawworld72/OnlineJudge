import { getAuth } from "firebase-admin/auth";
import { createCallable } from "../shared/callableFactory";
import { teacherLoginSchema } from "../shared/schemas";
import { domainError } from "../shared/errors";
import { getTeacherAccessCode } from "../config";

/**
 * 교사 홈페이지(/teacher)의 유일한 진입점. Google 이메일 로그인을 요구하지 않는다 —
 * 클라이언트는 먼저 Firebase 익명 인증(signInAnonymously)으로 로그인한 뒤 이 함수를
 * 호출해 공유 출입코드를 검증받는다. 통과하면 그 익명 계정에 커스텀 클레임
 * `teacher: true`를 부여하고, 이후 모든 교사용 Callable Function은 `requireTeacher`로
 * 그 클레임만 확인한다(authorization.ts). 커스텀 클레임은 다음 ID 토큰 발급부터
 * 반영되므로, 클라이언트는 이 호출이 성공한 뒤 `getIdToken(true)`로 토큰을 새로
 * 받아야 한다.
 */
export const teacherLogin = createCallable(teacherLoginSchema, async ({ data, uid }) => {
  if (data.accessCode !== getTeacherAccessCode()) {
    throw domainError("INVALID_ACCESS_CODE", "출입코드가 일치하지 않습니다.");
  }
  await getAuth().setCustomUserClaims(uid, { teacher: true });
  return { ok: true as const };
});
