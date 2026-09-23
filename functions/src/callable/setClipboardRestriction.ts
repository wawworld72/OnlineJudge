import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { setClipboardRestrictionSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";

/**
 * 학생 응시 화면(QuizTaking)의 코드 에디터에서 붙여넣기·끌어다놓기·복사·잘라내기를
 * 막을지 켜고 끄는 토글(부정행위 방지, 특히 AI 도구로의 문제·코드 유출 차단).
 * 상태·시각과 무관하게 언제든 바꿀 수 있다 — 실제 차단은 응시 화면에서만 동작하고
 * 복기 화면(ResultView)에는 적용되지 않는다.
 */
export const setClipboardRestriction = createCallable(
  setClipboardRestrictionSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    await getFirestore()
      .collection("quizzes")
      .doc(data.quizId)
      .update({ clipboardRestricted: data.restricted });
    return { clipboardRestricted: data.restricted };
  },
);
