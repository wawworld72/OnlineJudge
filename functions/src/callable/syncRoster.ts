import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { syncRosterSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { systemError } from "../shared/errors";
import { listCourseStudents } from "../services/classroomClient";
import { normalizeStudentId } from "../shared/identity";
import type { Student } from "../models/types";

// Firestore 문서ID로 쓸 수 없는 값만 걸러낸다("/" 포함, 빈 문자열) — 숫자인지 아닌지는
// 더 이상 따지지 않는다(아래 주석 참고).
const INVALID_STUDENT_ID_PATTERN = /\//;

/**
 * FR-026~027. Classroom 계정 이메일의 로컬파트(`@` 앞부분)를 학번(고유 식별자)으로
 * 쓴다 — 숫자여야 한다는 제약은 없다. 학생이 우리 앱에 입장할 때 "학번"란에 입력하는
 * 값과 여기서 저장하는 값은 `normalizeStudentId`(trim + 소문자화)를 거쳐야만 항상
 * 같은 문서ID로 수렴한다 — 영문 계정명은 대소문자를 다르게 입력하기 쉬워서, 정규화
 * 없이 대소문자까지 정확히 일치하길 요구하면 정당한 학생도 IDENTITY_MISMATCH로
 * 튕겨나간다(숫자 학번은 대소문자가 없어 이 문제가 드러나지 않았다). 즉 숫자로만
 * 된 학번을 쓰는 학생과, Classroom 계정명이 학번이 아닌 학생이 같은 강의에 섞여 있어도
 * 각자 자기 이메일 앞부분을 입력하면 동작한다. `students`(학생명부)는 Classroom이
 * 이미 알고 있는 이메일로 갱신할 수 있는 신뢰된 경로다 — 학생이 직접 호출하는
 * `registerStudentEmail`(한 번 등록하면 불변)과는 다른 권한 경로이므로 이미 이메일이 있는
 * 학번도 최신 값으로 덮어쓸 수 있다.
 */
export const syncRoster = createCallable(syncRosterSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();

  let classroomStudents;
  try {
    classroomStudents = await listCourseStudents(data.courseId, authEmail);
  } catch (cause) {
    throw systemError("syncRoster.listCourseStudents", cause);
  }

  let newStudents = 0;
  let updatedEmails = 0;
  let newRosterEntries = 0;
  let updatedRosterEntries = 0;
  let skipped = 0;

  for (const classroomStudent of classroomStudents) {
    const studentId = normalizeStudentId(classroomStudent.email.split("@")[0] ?? "");
    if (!studentId || INVALID_STUDENT_ID_PATTERN.test(studentId)) {
      skipped += 1;
      continue;
    }

    const studentRef = db.collection("students").doc(studentId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      await studentRef.set({
        name: classroomStudent.name,
        email: classroomStudent.email,
        status: "ACTIVE",
      } satisfies Student);
      newStudents += 1;
    } else {
      const student = studentSnap.data() as Student;
      if (student.email !== classroomStudent.email) {
        await studentRef.update({ email: classroomStudent.email });
        updatedEmails += 1;
      }
    }

    const rosterRef = db.collection("rosters").doc(`${data.courseId}_${studentId}`);
    const rosterSnap = await rosterRef.get();
    const rosterFields = {
      courseId: data.courseId,
      studentId,
      name: classroomStudent.name,
      email: classroomStudent.email,
      syncedAt: FieldValue.serverTimestamp(),
    };
    if (!rosterSnap.exists) {
      await rosterRef.set(rosterFields);
      newRosterEntries += 1;
    } else {
      await rosterRef.update(rosterFields);
      updatedRosterEntries += 1;
    }
  }

  return { newStudents, updatedEmails, newRosterEntries, updatedRosterEntries, skipped };
});
