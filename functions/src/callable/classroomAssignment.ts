import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { deployClassroomAssignmentSchema, resetClassroomDeploymentSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import { computePreDeployCheck } from "../services/preDeployCheck";
import { createCourseWork } from "../services/classroomClient";
import type { Problem, Quiz } from "../models/types";

export const deployClassroomAssignment = createCallable(
  deployClassroomAssignmentSchema,
  async ({ data, authEmail }) => {
    requireTeacher(authEmail);
    const db = getFirestore();
    const quizRef = db.collection("quizzes").doc(data.quizId);
    const quiz = (await quizRef.get()).data() as Quiz;

    if (quiz.courseWorkId) {
      throw domainError("ALREADY_DEPLOYED", "이미 Classroom에 배포된 퀴즈입니다.");
    }
    if (!quiz.courseId) {
      throw domainError("BLOCKED_BY_PREDEPLOY_CHECK", "연결된 분반이 없어 배포할 수 없습니다.");
    }

    const { blockingCount } = await computePreDeployCheck(db, data.quizId);
    if (blockingCount > 0) {
      throw domainError(
        "BLOCKED_BY_PREDEPLOY_CHECK",
        "배포 전 점검을 통과하지 못해 Classroom에 배포할 수 없습니다.",
      );
    }

    const problemsSnap = await quizRef.collection("problems").where("deletedAt", "==", null).get();
    const maxPoints = problemsSnap.docs.reduce(
      (sum, doc) => sum + (doc.data() as Problem).pointsTotal,
      0,
    );

    const result = await createCourseWork(
      quiz.courseId,
      quiz.title,
      quiz.description,
      maxPoints,
      quiz.endAt.toDate(),
    );

    await quizRef.update({ courseWorkId: result.courseWorkId, courseWorkLink: result.alternateLink });
    return result;
  },
);

/** FR-029. 재배포는 이 명시적 초기화 이후에만 가능하다. */
export const resetClassroomDeployment = createCallable(
  resetClassroomDeploymentSchema,
  async ({ data, authEmail }) => {
    requireTeacher(authEmail);
    await getFirestore()
      .collection("quizzes")
      .doc(data.quizId)
      .update({ courseWorkId: null, courseWorkLink: null });
    return { ok: true as const };
  },
);
