import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setTestCaseRevealSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";

/**
 * 퀴즈가 CLOSED된 뒤 학생 결과 화면에서 비공개 테스트케이스까지 공개할지
 * 켜고 끄는 토글. 상태·시각과 무관하게 언제든 바꿀 수 있다 — 실제 공개 여부는
 * `getMyResult.ts`가 `status === "CLOSED"`와 함께 검사하므로, 아직 OPEN인
 * 퀴즈에서 미리 켜둬도 안전하다.
 */
export const setTestCaseReveal = createCallable(
  setTestCaseRevealSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    await getFirestore()
      .collection("quizzes")
      .doc(data.quizId)
      .update({ revealTestCases: data.revealed });
    return { revealTestCases: data.revealed };
  },
);
