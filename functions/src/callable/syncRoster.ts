import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { syncRosterSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { systemError } from "../shared/errors";
import { listCourseStudents } from "../services/classroomClient";
import type { Student } from "../models/types";

// Firestore 문서ID로 쓸 수 없는 값만 걸러낸다("/" 포함, 빈 문자열) — 숫자인지 아닌지는
// 더 이상 따지지 않는다(아래 주석 참고).
const INVALID_STUDENT_ID_PATTERN = /\//;

/**
 * FR-026~027. Classroom 계정 이메일의 로컬파트(`@` 앞부분)를 학번(고유 식별자)으로
 * 그대로 쓴다 — 숫자여야 한다는 제약은 없다. 학생이 우리 앱에 입장할 때 "학번"란에
 * 입력하는 값과 여기서 저장하는 값이 글자 그대로 똑같기만 하면 된다(학교 발급 학번이든,
 * 이메일 계정명이든 무관 — `verifyStudentIdentity`도 문자열 일치만 본다). 즉 숫자로만
 * 된 학번을 쓰는 학생과, Classroom 계정명이 학번이 아닌 학생이 같은 강의에 섞여 있어도
 * 각자 자기 이메일 앞부분을 그대로 입력하면 동작한다. `students`(학생명부)는 Classroom이
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
    const studentId = classroomStudent.email.split("@")[0] ?? "";
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
      courseName: data.courseId,
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
