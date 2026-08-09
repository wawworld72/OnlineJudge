import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { upsertQuizSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import type { Quiz } from "../models/types";

export const upsertQuiz = createCallable(upsertQuizSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();

  const fields = {
    title: data.title,
    description: data.description,
    startAt: Timestamp.fromMillis(data.startAt),
    endAt: Timestamp.fromMillis(data.endAt),
    accessCode: data.accessCode,
    maxRunsPerProblem: data.maxRunsPerProblem,
    courseId: data.courseId,
  };

  if (data.quizId) {
    const quizRef = db.collection("quizzes").doc(data.quizId);
    await quizRef.update(fields);
    const quiz = (await quizRef.get()).data() as Quiz;
    return { quizId: data.quizId, status: quiz.status };
  }

  const newQuiz: Quiz = {
    ...fields,
    status: "DRAFT",
    courseWorkId: null,
    courseWorkLink: null,
    archivedAt: null,
    archiveSpreadsheetUrl: null,
    deletedAt: null,
  };
  const quizRef = await db.collection("quizzes").add(newQuiz);
  return { quizId: quizRef.id, status: "DRAFT" as const };
});
