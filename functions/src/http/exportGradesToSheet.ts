import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { getSheetExportApiToken } from "../config";
import { getParticipantOverviewData, type OverviewItem } from "../services/participantOverview";
import { getGradeDetailRows, type TcDetailRow } from "../services/gradeExport";

const STATUS_LABEL: Record<OverviewItem["status"], string> = {
  NOT_ENTERED: "미입장",
  IN_PROGRESS: "응시중",
  SUBMITTED: "제출완료",
  FINALIZED: "채점완료",
};

function toOverviewRow(item: OverviewItem): string[] {
  return [
    item.studentId,
    item.name,
    STATUS_LABEL[item.status],
    item.submittedAt ? new Date(item.submittedAt).toISOString() : "",
    item.finalTotal !== undefined ? String(item.finalTotal) : "",
  ];
}

function toDetailRow(row: TcDetailRow): string[] {
  return [
    row.studentId,
    row.name,
    row.problemId,
    row.problemTitle,
    String(row.tcNo),
    row.isPublic ? "공개" : "비공개",
    row.passed ? "PASS" : "FAIL",
    String(row.points),
    String(row.earnedPoints),
  ];
}

/**
 * Google Apps Script(수업 진행 중 언제든 성적 현황을 시트로 당겨가는 스크립트)용
 * 엔드포인트. Callable Function이 요구하는 Firebase Auth/App Check를 Apps Script는
 * 만들어낼 수 없으므로 `onCall`이 아니라 정적 토큰(`SHEET_EXPORT_API_TOKEN`)으로
 * 인증하는 평범한 HTTP 함수로 따로 둔다 — 저지 서버 연동에 쓰는 `GRADER_AUTH_TOKEN`과
 * 같은 방식이다. `tabs`는 시트 탭 이름 + (헤더 포함, 길이가 같은 문자열 배열들)의
 * 목록이라 Apps Script 쪽에서 탭별로 그대로 옮겨쓰기만 하면 된다 — 총점만 보는
 * "성적결과" 탭과, 문항·테스트케이스별 획득 점수까지 보는 "문항별_TC결과" 탭을
 * 함께 내려준다.
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
    const overviewItems = await getParticipantOverviewData(db, quizId);
    const overviewRows = [
      ["학번", "이름", "상태", "제출시각", "확정점수"],
      ...overviewItems.map(toOverviewRow),
    ];

    const detailRows = await getGradeDetailRows(db, quizId);
    const detailSheetRows = [
      ["학번", "이름", "문항ID", "문항제목", "TC번호", "공개여부", "결과", "배점", "획득점수"],
      ...detailRows.map(toDetailRow),
    ];

    res.status(200).json({
      ok: true,
      tabs: [
        { sheetName: "성적결과", rows: overviewRows },
        { sheetName: "문항별_TC결과", rows: detailSheetRows },
      ],
    });
  } catch (cause) {
    logger.error("exportGradesToSheet", cause);
    const message = cause instanceof Error ? cause.message : "일시적인 오류가 발생했습니다.";
    res.status(200).json({ ok: false, error: message });
  }
});
