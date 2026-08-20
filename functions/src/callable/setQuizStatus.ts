import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { createCallable } from "../shared/callableFactory";
import { setQuizStatusSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import { computePreDeployCheck } from "../services/preDeployCheck";
import { syncCourseRoster } from "../services/rosterSync";
import type { Quiz } from "../models/types";

export const setQuizStatus = createCallable(setQuizStatusSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();

  if (data.status === "OPEN") {
    const quizRef = db.collection("quizzes").doc(data.quizId);
    const quiz = (await quizRef.get()).data() as Quiz | undefined;

    // 교사가 "수강생 동기화"를 깜빡했거나, 그 이후 Classroom에서 학생을 추가/제외했는데
    // 재동기화를 안 한 상태로 공개하는 사고를 막는다 — OPEN 전환 시점에 한 번 더
    // 자동으로 맞춰둔다. Classroom API가 일시적으로 실패해도 공개 자체를 막지는
    // 않는다(예전에 동기화된 명부가 있으면 그걸로도 충분히 동작하고, 급하게 수업을
    // 시작해야 하는 교사를 외부 API 장애로 막는 건 더 나쁘다) — 명부가 아예 없는
    // 경우는 아래 computePreDeployCheck의 BLOCK이 그대로 막아준다.
    if (quiz?.courseId) {
      try {
        await syncCourseRoster(db, quiz.courseId);
      } catch (cause) {
        logger.warn("setQuizStatus: OPEN 전환 시 자동 명부 동기화 실패", {
          quizId: data.quizId,
          courseId: quiz.courseId,
          cause,
        });
      }
    }

    const { blockingCount } = await computePreDeployCheck(db, data.quizId);
    if (blockingCount > 0) {
      throw domainError(
        "BLOCKED_BY_PREDEPLOY_CHECK",
        "배포 전 점검을 통과하지 못해 공개로 전환할 수 없습니다.",
      );
    }
  }

  await db.collection("quizzes").doc(data.quizId).update({ status: data.status });
  return { status: data.status };
});
