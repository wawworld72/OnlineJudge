import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { addTestRosterEntrySchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { normalizeStudentId } from "../shared/identity";
import { domainError } from "../shared/errors";
import type { Student } from "../models/types";

/**
 * 실제 Classroom 계정 없이 Classroom 연동 퀴즈의 학생 화면(입장→문제 실행→제출)을
 * 교사가 직접 테스트할 수 있도록, 명부(rosters)에 `isTestEntry: true` 항목을 하나
 * 수동으로 추가하고, `students` 문서도 함께 만든다. `students`가 있어야
 * `resolveStudentIdByEmail`(practiceRun/finalSubmit/getMyResult가 씀)이 이메일로
 * 학번을 찾을 수 있다 — 이게 없으면 입장은 되지만 "실행"에서 IDENTITY_MISMATCH로
 * 막힌다(실제로 발견된 버그). 이미 그 studentId로 된 `students` 문서가 있으면 실제
 * 학생 데이터를 덮어쓰지 않도록 거부한다.
 *
 * `syncCourseRoster`(rosterSync.ts)가 실제 Classroom API 동기화로 쓰는 것과 같은
 * 문서 구조를 그대로 쓴다 — 그래서 교사가 나중에 진짜 "수강생 동기화"를 한 번
 * 실행하면, 이 studentId를 실제 Classroom API가 돌려주지 않는 한 기존 정리 로직에
 * 의해 `rosters` 항목은 자동으로 지워진다(단, `students`/`participants` 문서는
 * 자동 정리 대상이 아니다 — `isTestEntry` 플래그로 참가자 현황·성적 반영·시트
 * 내보내기에서 걸러질 뿐 영구히 남는다).
 */
export const addTestRosterEntry = createCallable(
  addTestRosterEntrySchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    const db = getFirestore();
    const studentId = normalizeStudentId(data.studentId);

    const studentRef = db.collection("students").doc(studentId);
    const studentSnap = await studentRef.get();
    if (studentSnap.exists) {
      throw domainError("STUDENT_ID_TAKEN", "이미 사용 중인 학번입니다. 다른 학번을 입력해주세요.");
    }
    await studentRef.set({
      name: data.name,
      email: data.email,
      status: "ACTIVE",
    } satisfies Student);

    await db.collection("rosters").doc(`${data.courseId}_${studentId}`).set({
      courseId: data.courseId,
      studentId,
      name: data.name,
      email: data.email,
      syncedAt: FieldValue.serverTimestamp(),
      isTestEntry: true,
    });
    return { ok: true as const };
  },
);
