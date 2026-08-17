import type { Firestore } from "firebase-admin/firestore";
import type { Participant, Problem, Quiz } from "../models/types";
import { getParticipantOverviewData, type OverviewItem } from "./participantOverview";

export interface GradeDetailTc {
  tcNo: number;
  isPublic: boolean;
  passed: boolean;
  points: number;
  earned: number;
}

export interface GradeDetailProblem {
  title: string;
  score: number;
  maxScore: number;
  tcResults: GradeDetailTc[];
}

export interface GradeRow {
  quizTitle: string;
  studentId: string;
  name: string;
  status: OverviewItem["status"];
  submittedAt?: number;
  finalTotal?: number;
  /** 문항ID → 문항별 상세(점수·테스트케이스별 획득 점수). 시트 셀에는 JSON 문자열로 담긴다. */
  detail: Record<string, GradeDetailProblem>;
}

async function getGradeRowsForQuiz(
  db: Firestore,
  quizId: string,
  quizTitle: string,
): Promise<GradeRow[]> {
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

  return overview.map((item) => {
    const runResults = runResultsByStudentId.get(item.studentId);
    const detail: Record<string, GradeDetailProblem> = {};
    if (runResults) {
      for (const [problemId, result] of Object.entries(runResults)) {
        detail[problemId] = {
          title: titleByProblemId.get(problemId) ?? problemId,
          score: result.score,
          maxScore: result.maxScore,
          tcResults: result.tcResults.map((tc, index) => ({
            tcNo: index + 1,
            isPublic: tc.isPublic,
            passed: tc.passed,
            points: tc.points,
            earned: tc.passed ? tc.points : 0,
          })),
        };
      }
    }
    return {
      quizTitle,
      studentId: item.studentId,
      name: item.name,
      status: item.status,
      submittedAt: item.submittedAt,
      finalTotal: item.finalTotal,
      detail,
    };
  });
}

/**
 * `exportGradesToSheet`가 "이 과목명의 퀴즈 전부"를 한 번에 내려주기 위한 조회. 같은
 * 과목명을 가진 퀴즈가 여러 개(중간고사·기말고사·매주 실습 등)일 수 있으므로, 학생별
 * 1행이 아니라 (퀴즈 × 학생) 조합별 1행으로 반환한다 — 어느 퀴즈의 결과인지 `quizTitle`로
 * 구분한다. `subjectName`은 Classroom `courseId`와 별개로 교사가 직접 붙이는 과목
 * 구분용 이름이다(models/types.ts `Quiz.subjectName`).
 */
export async function getGradeRowsForSubject(db: Firestore, subjectName: string): Promise<GradeRow[]> {
  const quizzesSnap = await db
    .collection("quizzes")
    .where("subjectName", "==", subjectName)
    .where("deletedAt", "==", null)
    .get();
  if (quizzesSnap.empty) {
    throw new Error("해당 과목명의 퀴즈를 찾을 수 없습니다.");
  }

  const rows: GradeRow[] = [];
  for (const doc of quizzesSnap.docs) {
    const quiz = doc.data() as Quiz;
    rows.push(...(await getGradeRowsForQuiz(db, doc.id, quiz.title)));
  }
  return rows;
}
