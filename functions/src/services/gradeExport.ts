import type { Firestore } from "firebase-admin/firestore";
import type { Participant, Problem } from "../models/types";
import { getParticipantOverviewData } from "./participantOverview";

export interface TcDetailRow {
  studentId: string;
  name: string;
  problemId: string;
  problemTitle: string;
  tcNo: number;
  isPublic: boolean;
  passed: boolean;
  points: number;
  earnedPoints: number;
}

/**
 * `exportGradesToSheet`가 문항별·테스트케이스별 획득 점수까지 내려주기 위한 상세
 * 조회. `getParticipantOverviewData`(요약)와는 별개로, 참가자 문서의 `runResults`
 * (테스트케이스별 결과가 실제로 들어있는 곳)를 그대로 순회한다. TC 번호는 별도
 * 필드가 없어 배열 순서(index+1)를 그대로 쓴다 — 학생 화면(`TcResultTable`)이
 * 표시하는 TC 번호와 동일한 기준이다.
 */
export async function getGradeDetailRows(db: Firestore, quizId: string): Promise<TcDetailRow[]> {
  const overview = await getParticipantOverviewData(db, quizId);
  const nameByStudentId = new Map(overview.map((item) => [item.studentId, item.name]));

  const problemsSnap = await db
    .collection("quizzes")
    .doc(quizId)
    .collection("problems")
    .where("deletedAt", "==", null)
    .orderBy("order")
    .get();
  const titleByProblemId = new Map(
    problemsSnap.docs.map((doc) => [doc.id, (doc.data() as Problem).title]),
  );

  const participantsSnap = await db.collection("participants").where("quizId", "==", quizId).get();

  const rows: TcDetailRow[] = [];
  for (const doc of participantsSnap.docs) {
    const participant = doc.data() as Participant;
    const name = nameByStudentId.get(participant.studentId) ?? participant.studentId;
    for (const [problemId, result] of Object.entries(participant.runResults)) {
      const problemTitle = titleByProblemId.get(problemId) ?? problemId;
      result.tcResults.forEach((tc, index) => {
        rows.push({
          studentId: participant.studentId,
          name,
          problemId,
          problemTitle,
          tcNo: index + 1,
          isPublic: tc.isPublic,
          passed: tc.passed,
          points: tc.points,
          earnedPoints: tc.passed ? tc.points : 0,
        });
      });
    }
  }
  return rows;
}
