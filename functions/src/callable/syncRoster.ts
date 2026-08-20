import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { syncRosterSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { syncCourseRoster } from "../services/rosterSync";

/**
 * 교사가 명시적으로 실행하는 진입점. 핵심 로직은 `syncCourseRoster`(services/rosterSync.ts)에
 * 있다 — `setQuizStatus`가 OPEN 전환 시 같은 로직을 자동으로도 실행한다.
 */
export const syncRoster = createCallable(syncRosterSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  return syncCourseRoster(getFirestore(), data.courseId);
});
