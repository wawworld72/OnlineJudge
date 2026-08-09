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
  authEmail: string;
}

type Handler<T, R> = (request: AuthedCallableRequest<T>) => Promise<R>;

/**
 * 모든 Callable Function이 공유하는 생성 헬퍼(research.md §6~7). `enforceAppCheck: true`를
 * 기본 적용해 실제 배포된 웹앱이 아닌 곳에서의 호출을 계약 도달 전에 거부하고, 핸들러 실행
 * 전 Zod 스키마로 입력을 검증한다. 로그인하지 않은 호출도 여기서 즉시 거부한다. `options`로
 * `timeoutSeconds` 등 함수별 배포 설정을 덮어쓸 수 있다(예: `batchGrade`, research.md §15).
 */
export function createCallable<T, R>(
  schema: ZodType<T>,
  handler: Handler<T, R>,
  options: Partial<CallableOptions> = {},
) {
  return onCall<unknown>(
    { enforceAppCheck: true, ...options },
    async (request: CallableRequest<unknown>) => {
      const authEmail = request.auth?.token.email;
      if (!authEmail) {
        throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
      }

      const parsed = schema.safeParse(request.data);
      if (!parsed.success) {
        throw domainError("INVALID_REQUEST", "요청 형식이 올바르지 않습니다.");
      }

      return handler({ data: parsed.data, authEmail });
    },
  );
}
