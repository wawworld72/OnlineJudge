import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setQuizStatusSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import { computePreDeployCheck } from "../services/preDeployCheck";

export const setQuizStatus = createCallable(setQuizStatusSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();

  if (data.status === "OPEN") {
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
