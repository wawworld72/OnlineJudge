import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getSheetExportApiToken } from "../config";
import { getParticipantOverviewData, type OverviewItem } from "../services/participantOverview";

const STATUS_LABEL: Record<OverviewItem["status"], string> = {
  NOT_ENTERED: "미입장",
  IN_PROGRESS: "응시중",
  SUBMITTED: "제출완료",
  FINALIZED: "채점완료",
};

function toRow(item: OverviewItem): string[] {
  return [
    item.studentId,
    item.name,
    STATUS_LABEL[item.status],
    item.submittedAt ? new Date(item.submittedAt).toISOString() : "",
    item.finalTotal !== undefined ? String(item.finalTotal) : "",
  ];
}

/**
 * Google Apps Script(수업 진행 중 언제든 성적 현황을 시트로 당겨가는 스크립트)용
 * 엔드포인트. `getParticipantOverview`(교사 화면)와 같은 데이터를 반환하지만,
 * Callable Function이 요구하는 Firebase Auth/App Check를 Apps Script는 만들어낼
 * 수 없으므로 `onCall`이 아니라 정적 토큰(`SHEET_EXPORT_API_TOKEN`)으로 인증하는
 * 평범한 HTTP 함수로 따로 둔다 — 저지 서버 연동에 쓰는 `GRADER_AUTH_TOKEN`과 같은
 * 방식이다. 응답의 `rows`는 헤더 포함, 길이가 같은 문자열 배열들이라 Apps Script
 * 쪽에서 시트에 그대로 옮겨쓰기만 하면 된다.
 */
export const exportGradesToSheet = onRequest(async (req, res) => {
  const authHeader = req.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token || token !== getSheetExportApiToken()) {
    res.status(200).json({ ok: false, error: "unauthorized" });
    return;
  }

  const quizId = req.query.quizId;
  if (typeof quizId !== "string" || !quizId) {
    res.status(200).json({ ok: false, error: "quizId가 필요합니다." });
    return;
  }

  try {
    const db = getFirestore();
    const items = await getParticipantOverviewData(db, quizId);
    const rows = [["학번", "이름", "상태", "제출시각", "확정점수"], ...items.map(toRow)];
    res.status(200).json({ ok: true, sheetName: "성적결과", rows });
  } catch (cause) {
    logger.error("exportGradesToSheet", cause);
    const message = cause instanceof Error ? cause.message : "일시적인 오류가 발생했습니다.";
    res.status(200).json({ ok: false, error: message });
  }
});
