import type { Firestore } from "firebase-admin/firestore";
import type { Participant, Problem, Quiz } from "../models/types";
import { getParticipantOverviewData } from "./participantOverview";
import { STATUS_LABEL } from "../http/exportGradesToSheet";
import { extractQuizIdFromUrl } from "./quizSheetSync";

const HEADER = [
  "제출시각",
  "이메일 주소",
  "이름",
  "학번",
  "주제",
  "과목명",
  "상태",
  "문항별 점수",
  "문항별 테스트케이스 점수",
  "총점",
];

/**
 * `exportQuizResultToSheet`(퀴즈 링크 하나로 그 퀴즈만의 채점 결과를 요청하는 GAS 연동)용
 * 조회. 과목명으로 여러 퀴즈를 묶는 `getGradeExportForSubject`(gradeExport.ts)와 달리,
 * 이건 퀴즈 하나를 참가자 1명 = 1행인 단일 표로 반환한다 — "문항별 점수"/"문항별
 * 테스트케이스 점수"를 한 행 안에 콤마로 이어붙여야 해서 별도 조회로 뽑았다.
 */
export async function getQuizResultRows(
  db: Firestore,
  { quizId, quizUrl }: { quizId?: string; quizUrl?: string },
): Promise<string[][]> {
  const resolvedQuizId = quizId ?? (quizUrl ? extractQuizIdFromUrl(quizUrl) : null);
  if (!resolvedQuizId) {
    throw new Error("quizId 또는 quizUrl이 필요합니다.");
  }

  const quizSnap = await db.collection("quizzes").doc(resolvedQuizId).get();
  const quiz = quizSnap.data() as Quiz | undefined;
  if (!quizSnap.exists || !quiz || quiz.deletedAt !== null) {
    throw new Error("퀴즈를 찾을 수 없습니다.");
  }

  const problemsSnap = await db
    .collection("quizzes")
    .doc(resolvedQuizId)
    .collection("problems")
    .where("deletedAt", "==", null)
    .orderBy("order")
    .get();
  const problems = problemsSnap.docs.map((doc) => ({
    problemId: doc.id,
    ...(doc.data() as Problem),
  }));

  const overview = await getParticipantOverviewData(db, resolvedQuizId);

  const participantsSnap = await db
    .collection("participants")
    .where("quizId", "==", resolvedQuizId)
    .get();
  const runResultsByStudentId = new Map(
    participantsSnap.docs.map((doc) => {
      const participant = doc.data() as Participant;
      return [participant.studentId, participant.runResults];
    }),
  );

  const rows = overview.map((item) => {
    const runResults =
      item.status === "FINALIZED" ? runResultsByStudentId.get(item.studentId) : undefined;

    const perProblemScores = runResults
      ? problems.map((p) => String(runResults[p.problemId]?.score ?? 0)).join(",")
      : "";
    const perTestCaseScores = runResults
      ? problems
          .flatMap((p) => runResults[p.problemId]?.tcResults ?? [])
          .map((tc) => String(tc.passed ? tc.points : 0))
          .join(",")
      : "";

    return [
      item.submittedAt ? new Date(item.submittedAt).toISOString() : "",
      item.email ?? "",
      item.name,
      item.studentId,
      quiz.title,
      quiz.subjectName,
      STATUS_LABEL[item.status],
      perProblemScores,
      perTestCaseScores,
      item.finalTotal !== undefined ? String(item.finalTotal) : "",
    ];
  });

  return [HEADER, ...rows];
}
