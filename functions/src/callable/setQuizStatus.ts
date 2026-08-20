import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setQuizStatusSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import { computePreDeployCheck } from "../services/preDeployCheck";

export const setQuizStatus = createCallable(setQuizStatusSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();

  if (data.status === "OPEN") {
    // 명부(rosters)는 퀴즈가 아니라 courseId(Classroom 강의) 단위로 저장된다 — 같은
    // 강의를 쓰는 퀴즈 여러 개가 있으면 그중 하나만 동기화해도 전부 최신 명부를 쓴다.
    // 그래서 여기서 퀴즈마다 다시 동기화를 시도하지 않는다("Classroom 연동" 탭의
    // "수강생 동기화" 버튼을 교사가 직접, 강의당 한 번만 누르면 된다). 명부가 아예
    // 없으면(한 번도 동기화 안 함) 아래 computePreDeployCheck의 BLOCK이 막아준다.
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
