import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { archiveQuizSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { retryOnce } from "../shared/retryOnce";
import { systemError } from "../shared/errors";
import { createArchiveSpreadsheet, type ArchiveTab } from "../services/sheetsClient";
import type { Participant, Problem, Quiz } from "../models/types";

/**
 * FR-037~038. 4개 탭(퀴즈 개요/참가자 및 확정 점수/문항별 채점 결과/제출 코드)으로 구성된
 * 스프레드시트를 만든다. 문항별 채점 결과·제출 코드 탭은 참가자 문서의 `submissions`/
 * `runResults` map을 순회해 행으로 펼친다(data-model.md — 서브컬렉션이 아니라 map으로
 * 통합한 구조를 그대로 반영).
 */
export const archiveQuiz = createCallable(archiveQuizSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  const problemsSnap = await quizRef.collection("problems").where("deletedAt", "==", null).get();
  const problems = problemsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Problem) }));

  const participantsSnap = await db.collection("participants").where("quizId", "==", data.quizId).get();
  const participants = participantsSnap.docs.map((doc) => doc.data() as Participant);

  const overviewTab: ArchiveTab = {
    name: "퀴즈 개요",
    rows: [
      ["제목", quiz.title],
      ["설명", quiz.description],
      ["시작", quiz.startAt.toDate().toISOString()],
      ["종료", quiz.endAt.toDate().toISOString()],
      ["출입코드", quiz.accessCode],
      ["문항 수", String(problems.length)],
    ],
  };

  const participantsTab: ArchiveTab = {
    name: "참가자 및 확정 점수",
    rows: [
      ["학번", "상태", "제출시각", "확정점수"],
      ...participants.map((p) => [
        p.studentId,
        p.finalStatus,
        p.finalSubmittedAt?.toDate().toISOString() ?? "",
        String(p.finalTotal),
      ]),
    ],
  };

  const resultsTab: ArchiveTab = {
    name: "문항별 채점 결과",
    rows: [
      ["학번", "문항ID", "상태", "점수", "만점"],
      ...participants.flatMap((p) =>
        Object.entries(p.runResults).map(([problemId, result]) => [
          p.studentId,
          problemId,
          result.status,
          String(result.score),
          String(result.maxScore),
        ]),
      ),
    ],
  };

  const submissionsTab: ArchiveTab = {
    name: "제출 코드",
    rows: [
      ["학번", "문항ID", "코드"],
      ...participants.flatMap((p) =>
        Object.entries(p.submissions).map(([problemId, submission]) => [
          p.studentId,
          problemId,
          submission.code,
        ]),
      ),
    ],
  };

  let created;
  try {
    created = await retryOnce(() =>
      createArchiveSpreadsheet(quiz.title, [overviewTab, participantsTab, resultsTab, submissionsTab]),
    );
  } catch (cause) {
    throw systemError("archiveQuiz", cause);
  }

  await quizRef.update({ archivedAt: FieldValue.serverTimestamp(), archiveSpreadsheetUrl: created.url });
  return { spreadsheetUrl: created.url };
});
