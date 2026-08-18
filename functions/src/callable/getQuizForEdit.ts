import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { getQuizForEditSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import type { Problem, ProblemSecrets, Quiz } from "../models/types";

/**
 * 교사 편집 화면(QuizManager/ProblemEditor)이 필요로 하는 퀴즈 전체 필드 + 문항 목록 +
 * 문항별 테스트케이스(`problemSecrets.items`, 교사에게는 정답을 그대로 보여줘야 함)를 한
 * 번에 반환한다 — research.md §18.
 */
export const getQuizForEdit = createCallable(getQuizForEditSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) {
    throw domainError("QUIZ_NOT_OPEN", "존재하지 않는 퀴즈입니다.");
  }
  const quiz = quizSnap.data() as Quiz;

  const problemsSnap = await quizRef
    .collection("problems")
    .where("deletedAt", "==", null)
    .orderBy("order")
    .get();

  const problems = await Promise.all(
    problemsSnap.docs.map(async (doc) => {
      const problem = doc.data() as Problem;
      const secretsSnap = await quizRef.collection("problemSecrets").doc(doc.id).get();
      const secrets = secretsSnap.data() as ProblemSecrets | undefined;
      return {
        problemId: doc.id,
        order: problem.order,
        title: problem.title,
        description: problem.description,
        initialCode: problem.initialCode,
        maxRuns: problem.maxRuns,
        pointsTotal: problem.pointsTotal,
        testCases: secrets?.items ?? [],
      };
    }),
  );

  return {
    quizId: data.quizId,
    subjectName: quiz.subjectName,
    title: quiz.title,
    description: quiz.description,
    startAt: quiz.startAt.toMillis(),
    endAt: quiz.endAt.toMillis(),
    accessCode: quiz.accessCode,
    status: quiz.status,
    maxRunsPerProblem: quiz.maxRunsPerProblem,
    courseId: quiz.courseId,
    courseWorkId: quiz.courseWorkId,
    courseWorkLink: quiz.courseWorkLink,
    archivedAt: quiz.archivedAt?.toMillis() ?? null,
    archiveSpreadsheetUrl: quiz.archiveSpreadsheetUrl,
    problems,
  };
});
