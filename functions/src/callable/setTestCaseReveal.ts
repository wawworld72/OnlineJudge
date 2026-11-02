import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setTestCaseRevealSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";

/**
 * 학생이 최종 제출을 마친 뒤 결과 화면에서 비공개 테스트케이스(입력·기대 출력)까지
 * 자동 공개할지 켜고 끄는 토글(안전장치). 상태·시각과 무관하게 언제든 바꿀 수 있다 —
 * 실제 공개 여부는 `getMyResult.ts`가 호출될 때마다 이 값을 읽어 결정한다.
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
