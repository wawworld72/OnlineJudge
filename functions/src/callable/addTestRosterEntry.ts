import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { addTestRosterEntrySchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { normalizeStudentId } from "../shared/identity";

/**
 * 실제 Classroom 계정 없이 Classroom 연동 퀴즈의 학생 화면(입장→문제 실행→제출)을
 * 교사가 직접 테스트할 수 있도록, 명부(rosters)에 항목 하나를 수동으로 추가한다.
 * `syncCourseRoster`(rosterSync.ts)가 실제 Classroom API 동기화로 쓰는 것과 완전히
 * 같은 문서 구조를 그대로 쓴다 — 그래서 교사가 나중에 진짜 "수강생 동기화"를 한 번
 * 실행하면, 이 studentId를 실제 Classroom API가 돌려주지 않는 한 기존 정리 로직에
 * 의해 자동으로 지워진다(별도 정리 불필요). `students`(전역 학생 문서)는 건드리지
 * 않는다 — Classroom 연동 입장 경로(resolveClassroomIdentity, shared/identity.ts)는
 * `rosters`만 읽으므로 불필요하고, 굳이 건드리면 나중에 비연동 퀴즈에서 같은
 * studentId와 충돌할 수 있다.
 */
export const addTestRosterEntry = createCallable(
  addTestRosterEntrySchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    const db = getFirestore();
    const studentId = normalizeStudentId(data.studentId);
    await db.collection("rosters").doc(`${data.courseId}_${studentId}`).set({
      courseId: data.courseId,
      studentId,
      name: data.name,
      email: data.email,
      syncedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true as const };
  },
);
