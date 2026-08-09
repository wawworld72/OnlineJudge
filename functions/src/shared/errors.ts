import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

export type DomainErrorCode =
  | "INVALID_ACCESS_CODE"
  | "IDENTITY_MISMATCH"
  | "QUIZ_NOT_OPEN"
  | "QUIZ_NOT_ACTIVE"
  | "QUIZ_CLOSED"
  | "NEEDS_EMAIL_REGISTRATION"
  | "EMAIL_ALREADY_REGISTERED"
  | "EMAIL_ALREADY_IN_USE"
  | "NO_RUNS_LEFT"
  | "ALREADY_DEPLOYED"
  | "NOT_DEPLOYED"
  | "NO_FINALIZED_PARTICIPANTS"
  | "NOT_ARCHIVED_YET"
  | "BLOCKED_BY_PREDEPLOY_CHECK"
  | "INVALID_REQUEST";

/**
 * 예상된 업무 규칙 위반(FR-010 등 "서로 구분된 사유")은 사용자에게 그대로 보여줘도 되는
 * 구체적 사유다 — 헌법 VI의 "일반 안내로 감춘다"는 장애(예측 못 한 실패)에만 적용된다.
 */
export function domainError(code: DomainErrorCode, message: string): HttpsError {
  return new HttpsError("failed-precondition", message, { code });
}

/**
 * 외부 호출 실패 등 예측하지 못한 장애 — 사용자에게는 일반 안내만 노출하고 상세 원인은
 * Cloud Logging에만 남긴다(헌법 VI).
 */
export function systemError(logContext: string, cause: unknown): HttpsError {
  logger.error(logContext, cause);
  return new HttpsError(
    "internal",
    "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    { code: "SYSTEM_ERROR" },
  );
}
