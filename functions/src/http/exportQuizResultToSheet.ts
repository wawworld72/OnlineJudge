import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getSheetExportApiToken } from "../config";
import { getQuizResultRows } from "../services/quizResultExport";

/**
 * Google Apps Script(퀴즈 링크 하나로 그 퀴즈만의 채점 결과를 시트로 당겨가는 스크립트)용
 * 엔드포인트. `exportGradesToSheet`와 같은 이유로 `onCall`이 아니라 정적 토큰
 * (`SHEET_EXPORT_API_TOKEN`)으로 인증하는 평범한 HTTP 함수다 — 같은 "읽기" 등급 작업이라
 * 새 토큰을 따로 만들지 않고 그 토큰을 그대로 재사용한다.
 *
 * `exportGradesToSheet`는 과목명으로 여러 퀴즈를 묶어 2탭으로 반환하지만, 이 엔드포인트는
 * `quizId` 또는 `quizUrl` 하나로 그 퀴즈만의 결과를 참가자 1명 = 1행인 단일 표로
 * 반환한다 — 식별 기준과 반환 형태가 둘 다 달라 기존 계약을 건드리지 않고 새로 뒀다.
 */
export const exportQuizResultToSheet = onRequest(async (req, res) => {
  const authHeader = req.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token || token !== getSheetExportApiToken()) {
    res.status(200).json({ ok: false, error: "unauthorized" });
    return;
  }

  const quizId = req.query.quizId;
  const quizUrl = req.query.quizUrl;
  if (typeof quizId !== "string" && typeof quizUrl !== "string") {
    res.status(200).json({ ok: false, error: "quizId 또는 quizUrl이 필요합니다." });
    return;
  }

  try {
    const db = getFirestore();
    const rows = await getQuizResultRows(db, {
      quizId: typeof quizId === "string" ? quizId : undefined,
      quizUrl: typeof quizUrl === "string" ? quizUrl : undefined,
    });
    res.status(200).json({ ok: true, rows });
  } catch (cause) {
    logger.error("exportQuizResultToSheet", cause);
    const message = cause instanceof Error ? cause.message : "일시적인 오류가 발생했습니다.";
    res.status(200).json({ ok: false, error: message });
  }
});
