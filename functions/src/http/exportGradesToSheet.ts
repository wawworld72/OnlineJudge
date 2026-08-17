import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getSheetExportApiToken } from "../config";
import { getGradeRowsForSubject, type GradeRow } from "../services/gradeExport";

const STATUS_LABEL: Record<GradeRow["status"], string> = {
  NOT_ENTERED: "미입장",
  IN_PROGRESS: "응시중",
  SUBMITTED: "제출완료",
  FINALIZED: "채점완료",
};

function toRow(row: GradeRow): string[] {
  return [
    row.quizTitle,
    row.studentId,
    row.name,
    STATUS_LABEL[row.status],
    row.submittedAt ? new Date(row.submittedAt).toISOString() : "",
    row.finalTotal !== undefined ? String(row.finalTotal) : "",
    JSON.stringify(row.detail),
  ];
}

/**
 * Google Apps Script(수업 진행 중 언제든 성적 현황을 시트로 당겨가는 스크립트)용
 * 엔드포인트. Callable Function이 요구하는 Firebase Auth/App Check를 Apps Script는
 * 만들어낼 수 없으므로 `onCall`이 아니라 정적 토큰(`SHEET_EXPORT_API_TOKEN`)으로
 * 인증하는 평범한 HTTP 함수로 따로 둔다 — 저지 서버 연동에 쓰는 `GRADER_AUTH_TOKEN`과
 * 같은 방식이다.
 *
 * `quizId` 하나가 아니라 `subject`(과목명)를 받아, 같은 과목명의 퀴즈를 전부 묶어
 * 반환한다 — 중간고사·기말고사·매주 실습처럼 한 과목에 퀴즈가 여러 개 있는 경우를
 * 위함이다. 각 행이 어느 퀴즈인지는 `퀴즈명` 열로 구분한다. 문항·테스트케이스별
 * 획득 점수는 별도 탭이 아니라 `문항별상세` 열에 JSON 문자열로 담는다 — 시트 하나로
 * 총점과 상세를 함께 보고, 필요할 때만 그 셀을 파싱해서 들여다보면 된다.
 */
export const exportGradesToSheet = onRequest(async (req, res) => {
  const authHeader = req.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token || token !== getSheetExportApiToken()) {
    res.status(200).json({ ok: false, error: "unauthorized" });
    return;
  }

  const subject = req.query.subject;
  if (typeof subject !== "string" || !subject) {
    res.status(200).json({ ok: false, error: "subject가 필요합니다." });
    return;
  }

  try {
    const db = getFirestore();
    const gradeRows = await getGradeRowsForSubject(db, subject);
    const rows = [
      ["퀴즈명", "학번", "이름", "상태", "제출시각", "확정점수", "문항별상세"],
      ...gradeRows.map(toRow),
    ];
    res.status(200).json({ ok: true, sheetName: "성적결과", rows });
  } catch (cause) {
    logger.error("exportGradesToSheet", cause);
    const message = cause instanceof Error ? cause.message : "일시적인 오류가 발생했습니다.";
    res.status(200).json({ ok: false, error: message });
  }
});
