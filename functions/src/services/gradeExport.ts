import type { Firestore } from "firebase-admin/firestore";
import type { Participant, Problem, Quiz } from "../models/types";
import { getParticipantOverviewData, type OverviewItem } from "./participantOverview";

export interface GradeSummaryRow {
  subjectName: string;
  quizTitle: string;
  studentId: string;
  name: string;
  status: OverviewItem["status"];
  submittedAt?: number;
  finalTotal?: number;
}

export interface GradeDetailTcRow {
  subjectName: string;
  quizTitle: string;
  studentId: string;
  name: string;
  problemTitle: string;
  tcNo: number;
  earned: number;
}

export interface GradeExportResult {
  summary: GradeSummaryRow[];
  detail: GradeDetailTcRow[];
}

async function collectForQuiz(
  db: Firestore,
  subjectName: string,
  quizId: string,
  quizTitle: string,
  out: GradeExportResult,
): Promise<void> {
  const overview = await getParticipantOverviewData(db, quizId);

  const problemsSnap = await db
    .collection("quizzes")
    .doc(quizId)
    .collection("problems")
    .where("deletedAt", "==", null)
    .get();
  const titleByProblemId = new Map(
    problemsSnap.docs.map((doc) => [doc.id, (doc.data() as Problem).title]),
  );

  const participantsSnap = await db.collection("participants").where("quizId", "==", quizId).get();
  const runResultsByStudentId = new Map(
    participantsSnap.docs.map((doc) => {
      const participant = doc.data() as Participant;
      return [participant.studentId, participant.runResults];
    }),
  );

  for (const item of overview) {
    out.summary.push({
      subjectName,
      quizTitle,
      studentId: item.studentId,
      name: item.name,
      status: item.status,
      submittedAt: item.submittedAt,
      finalTotal: item.finalTotal,
    });

    const runResults = runResultsByStudentId.get(item.studentId);
    if (!runResults) continue;
    for (const [problemId, result] of Object.entries(runResults)) {
      const problemTitle = titleByProblemId.get(problemId) ?? problemId;
      result.tcResults.forEach((tc, index) => {
        out.detail.push({
          subjectName,
          quizTitle,
          studentId: item.studentId,
          name: item.name,
          problemTitle,
          tcNo: index + 1,
          earned: tc.passed ? tc.points : 0,
        });
      });
    }
  }
}

/**
 * `exportGradesToSheet`가 "이 과목명의 퀴즈 전부"를 요약(성적결과)과 상세(문항별
 * 테스트케이스 획득 점수) 두 갈래로 내려주기 위한 조회. `subjectName`은 Classroom
 * `courseId`와 별개로 교사가 직접 붙이는 과목 구분용 이름이다(models/types.ts
 * `Quiz.subjectName`) — 같은 과목명을 가진 퀴즈가 여러 개(중간고사·기말고사·매주
 * 실습 등)일 수 있으므로 각 행이 어느 퀴즈인지는 `quizTitle`로 구분한다.
 */
export async function getGradeExportForSubject(
  db: Firestore,
  subjectName: string,
): Promise<GradeExportResult> {
  const quizzesSnap = await db
    .collection("quizzes")
    .where("subjectName", "==", subjectName)
    .where("deletedAt", "==", null)
    .get();
  if (quizzesSnap.empty) {
    throw new Error("해당 과목명의 퀴즈를 찾을 수 없습니다.");
  }

  const out: GradeExportResult = { summary: [], detail: [] };
  for (const doc of quizzesSnap.docs) {
    const quiz = doc.data() as Quiz;
    await collectForQuiz(db, subjectName, doc.id, quiz.title, out);
  }
  return out;
}
