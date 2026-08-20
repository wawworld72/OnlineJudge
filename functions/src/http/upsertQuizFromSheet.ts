import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getSheetSyncApiToken } from "../config";
import { sheetUpsertQuizSchema } from "../shared/schemas";
import { formatZodError } from "../shared/zodErrorMessage";
import { SheetSyncError, syncQuizFromSheet } from "../services/quizSheetSync";

/**
 * Google Apps Script(스프레드시트 기반으로 퀴즈를 생성/갱신하는 스크립트)용 엔드포인트.
 * `exportGradesToSheet`와 같은 이유로 `onCall`이 아니라 정적 토큰(`SHEET_SYNC_API_TOKEN`)
 * 으로 인증하는 평범한 HTTP 함수다 — 다만 이건 읽기가 아니라 **쓰기**(퀴즈·문항·
 * 테스트케이스 생성/수정)이므로 `SHEET_EXPORT_API_TOKEN`과는 별도의 토큰을 쓴다.
 *
 * 요청에 `quizId`/`quizUrl`이 없으면 생성(모든 필드 필수), 있으면 갱신(보낸 필드만
 * 부분 반영) — 문항/테스트케이스는 `title`/`tcNo`로 매칭한다(services/quizSheetSync.ts).
 * `courseId`가 있고 아직 Classroom에 배포되지 않았다면 이 요청 안에서 배포까지
 * 최선노력으로 시도해, 응답에 그 퀴즈의 Classroom 과제 URL도 함께 담아 보낸다.
 */
export const upsertQuizFromSheet = onRequest(async (req, res) => {
  const authHeader = req.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token || token !== getSheetSyncApiToken()) {
    res.status(200).json({ ok: false, error: "unauthorized" });
    return;
  }

  const parsed = sheetUpsertQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(200).json({ ok: false, error: formatZodError(parsed.error) });
    return;
  }

  try {
    const db = getFirestore();
    const result = await syncQuizFromSheet(db, parsed.data);
    res.status(200).json({ ok: true, ...result });
  } catch (cause) {
    if (cause instanceof SheetSyncError) {
      res.status(200).json({ ok: false, error: cause.message });
      return;
    }
    logger.error("upsertQuizFromSheet", cause);
    res.status(200).json({ ok: false, error: "일시적인 오류가 발생했습니다." });
  }
});
