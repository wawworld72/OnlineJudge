import {
  onCall,
  HttpsError,
  type CallableRequest,
  type CallableOptions,
} from "firebase-functions/v2/https";
import type { ZodType } from "zod";
import { domainError } from "./errors";

interface AuthedCallableRequest<T> {
  data: T;
  uid: string;
  /**
   * Google 이메일 로그인 사용자(학생)만 값이 있다 — 교사는 이제 익명 인증 +
   * 출입코드(`teacherLogin`)로 접근하므로 이메일이 없다. 학생 전용 함수(예:
   * `resolveStudentIdByEmail`)에서만 실제 값을 기대하고 쓴다.
   */
  authEmail: string;
  /** `teacherLogin`이 부여한 커스텀 클레임(`teacher: true`) 유무. `requireTeacher`가 확인한다. */
  isTeacher: boolean;
}

type Handler<T, R> = (request: AuthedCallableRequest<T>) => Promise<R>;

/**
 * 모든 Callable Function이 공유하는 생성 헬퍼(research.md §6~7). `enforceAppCheck: true`를
 * 기본 적용해 실제 배포된 웹앱이 아닌 곳에서의 호출을 계약 도달 전에 거부하고, 핸들러 실행
 * 전 Zod 스키마로 입력을 검증한다. 인증되지 않은 호출(Google 로그인도, 교사 익명 로그인도
 * 없는 경우)은 여기서 즉시 거부한다 — 교사는 이메일이 없는 익명 계정이므로 이메일 유무가
 * 아니라 `request.auth` 존재 여부로 판단한다. `options`로 `timeoutSeconds` 등 함수별
 * 배포 설정을 덮어쓸 수 있다(예: `batchGrade`, research.md §15).
 */
export function createCallable<T, R>(
  schema: ZodType<T>,
  handler: Handler<T, R>,
  options: Partial<CallableOptions> = {},
) {
  return onCall<unknown>(
    { enforceAppCheck: true, ...options },
    async (request: CallableRequest<unknown>) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
      }
      const authEmail = request.auth.token.email ?? "";
      const isTeacher = request.auth.token.teacher === true;

      const parsed = schema.safeParse(request.data);
      if (!parsed.success) {
        throw domainError("INVALID_REQUEST", "요청 형식이 올바르지 않습니다.");
      }

      return handler({ data: parsed.data, uid: request.auth.uid, authEmail, isTeacher });
    },
  );
}
