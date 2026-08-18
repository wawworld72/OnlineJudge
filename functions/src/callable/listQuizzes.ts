import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { listQuizzesSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import type { Quiz } from "../models/types";

/**
 * firestore.rules는 `status == 'OPEN'`인 퀴즈만 클라이언트 직접 read를 허용하므로, 교사가
 * 자신의 DRAFT/CLOSED 퀴즈까지 포함한 전체 목록을 보려면 별도 조회 경로가 필요하다 —
 * contracts/callable-functions.md에 빠져 있던 부분(research.md §18)을 이 함수로 채운다.
 */
export const listQuizzes = createCallable(listQuizzesSchema, async ({ isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();

  const snap = await db.collection("quizzes").where("deletedAt", "==", null).get();
  const quizzes = snap.docs.map((doc) => {
    const quiz = doc.data() as Quiz;
    return {
      quizId: doc.id,
      subjectName: quiz.subjectName,
      title: quiz.title,
      status: quiz.status,
      startAt: quiz.startAt.toMillis(),
      endAt: quiz.endAt.toMillis(),
    };
  });

  return { quizzes };
});
