import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setFocusGuardSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";

/**
 * 학생 응시 화면(QuizTaking)의 화면 이탈 감지(2단계 경고 + 서버 기록)를 켜고 끄는 토글
 * (부정행위 방지). 상태·시각과 무관하게 언제든 바꿀 수 있다 — 실제 동작은 응시 화면과
 * `reportFocusLoss`에서만 일어나며 복기 화면에는 적용되지 않는다.
 */
export const setFocusGuard = createCallable(setFocusGuardSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  await getFirestore()
    .collection("quizzes")
    .doc(data.quizId)
    .update({ focusGuardEnabled: data.enabled });
  return { focusGuardEnabled: data.enabled };
});
