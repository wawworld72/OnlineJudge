import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { syncRosterSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { listCourseStudents } from "../services/classroomClient";
import type { Student } from "../models/types";

const STUDENT_ID_PATTERN = /^\d+$/;

/**
 * FR-026~027. Classroom 계정 이메일의 로컬파트(`@` 앞부분)를 학번으로 간주한다 — 학번
 * 형식(숫자)이 아니면 동기화 대상에서 건너뛰고 별도로 집계한다. `students`(학생명부)는
 * Classroom이 이미 알고 있는 이메일로 갱신할 수 있는 신뢰된 경로다 — 학생이 직접 호출하는
 * `registerStudentEmail`(한 번 등록하면 불변)과는 다른 권한 경로이므로 이미 이메일이 있는
 * 학번도 최신 값으로 덮어쓸 수 있다.
 */
export const syncRoster = createCallable(syncRosterSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();

  const classroomStudents = await listCourseStudents(data.courseId);

  let newStudents = 0;
  let updatedEmails = 0;
  let newRosterEntries = 0;
  let updatedRosterEntries = 0;
  let skipped = 0;

  for (const classroomStudent of classroomStudents) {
    const studentId = classroomStudent.email.split("@")[0] ?? "";
    if (!STUDENT_ID_PATTERN.test(studentId)) {
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
