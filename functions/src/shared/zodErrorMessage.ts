import type { ZodError } from "zod";

/**
 * Google Apps Script 쪽에 그대로 보여줄 한 줄짜리 읽기 쉬운 오류 메시지로 합친다 —
 * `upsertQuizFromSheet`(HttpsError를 못 쓰는 onRequest 핸들러)가 Zod 검증 실패를
 * `{ok:false, error: string}`으로 응답할 때 쓴다.
 */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
