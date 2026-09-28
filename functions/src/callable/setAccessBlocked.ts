import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setAccessBlockedSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";

/**
 * 퀴즈 상태(OPEN/CLOSED)·복기 여부와 무관하게 이 퀴즈에 대한 모든 학생 접근을
 * 즉시 차단/해제하는 토글(문제 유출 방지용 비상 잠금). 상태·시각과 무관하게
 * 언제든 바꿀 수 있다 — 실제 차단은 `enterQuiz.ts`가 항상 검사한다.
 */
export const setAccessBlocked = createCallable(
  setAccessBlockedSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    await getFirestore()
      .collection("quizzes")
      .doc(data.quizId)
      .update({ accessBlocked: data.blocked });
    return { accessBlocked: data.blocked };
  },
);
