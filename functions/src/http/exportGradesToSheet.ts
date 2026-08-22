import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getSheetExportApiToken } from "../config";
import {
  getGradeExportForSubject,
  type GradeDetailTcRow,
  type GradeSummaryRow,
} from "../services/gradeExport";

export const STATUS_LABEL: Record<GradeSummaryRow["status"], string> = {
  NOT_ENTERED: "미입장",
  IN_PROGRESS: "응시중",
  SUBMITTED: "제출완료",
  FINALIZED: "채점완료",
};

function toSummaryRow(row: GradeSummaryRow): string[] {
  return [
    row.name,
    row.studentId,
    row.subjectName,
    row.quizTitle,
    STATUS_LABEL[row.status],
    row.submittedAt ? new Date(row.submittedAt).toISOString() : "",
    row.finalTotal !== undefined ? String(row.finalTotal) : "",
  ];
}

function toDetailRow(row: GradeDetailTcRow): string[] {
  return [
    row.name,
    row.studentId,
    row.subjectName,
    row.quizTitle,
    row.problemTitle,
    String(row.tcNo),
    String(row.earned),
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
 * 위함이다. 탭 2개를 함께 내려준다: "문항별_TC결과"(문항·테스트케이스별 획득 점수,
 * 1행=1 TC)와 "성적결과"(퀴즈별 상태·확정 점수, 1행=1 참가자). 각 행이 어느 과목·
 * 어느 퀴즈인지는 "과목명"/"퀴즈명" 열로 구분한다.
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
    const { summary, detail } = await getGradeExportForSubject(db, subject);

    const detailRows = [
      ["이름", "학번", "과목명", "퀴즈명", "문항명", "TC", "획득 점수"],
      ...detail.map(toDetailRow),
    ];
    const summaryRows = [
      ["이름", "학번", "과목명", "퀴즈명", "상태", "제출시각", "확정점수"],
      ...summary.map(toSummaryRow),
    ];

    res.status(200).json({
      ok: true,
      tabs: [
        { sheetName: "문항별_TC결과", rows: detailRows },
        { sheetName: "성적결과", rows: summaryRows },
      ],
    });
  } catch (cause) {
    logger.error("exportGradesToSheet", cause);
    const message = cause instanceof Error ? cause.message : "일시적인 오류가 발생했습니다.";
    res.status(200).json({ ok: false, error: message });
  }
});
