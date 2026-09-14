import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { batchGradeSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { runBatchGrade } from "../services/batchGradeService";
import type { Participant, Quiz } from "../models/types";

/**
 * FR-020~023, research.md §15. 핵심 채점 로직은 `runBatchGrade`(batchGradeService.ts)
 * 로 뽑아 GAS 채점결과 내보내기(exportGradesToSheet/exportQuizResultToSheet)와
 * 공유한다 — 여기 남은 부분은 교사 인증과, 교사용 UI 전용 응답 필드인
 * `classroomGradesPending` 계산뿐이다.
 */
export const batchGrade = createCallable(
  batchGradeSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    const db = getFirestore();
    const result = await runBatchGrade(db, data.quizId);

    const quiz = (await db.collection("quizzes").doc(data.quizId).get()).data() as Quiz;
    let classroomGradesPending = false;
    if (quiz.courseId) {
      const finalizedSnap = await db
        .collection("participants")
        .where("quizId", "==", data.quizId)
        .where("finalStatus", "==", "FINALIZED")
        .get();
      classroomGradesPending = finalizedSnap.docs.some(
        (doc) => (doc.data() as Participant).gradePushedAt === null,
      );
    }

    return { ...result, classroomGradesPending };
  },
  { timeoutSeconds: 540 },
);
