import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { registerStudentEmailSchema } from "../shared/schemas";
import { domainError } from "../shared/errors";
import { normalizeStudentId } from "../shared/identity";
import type { Student } from "../models/types";

export const registerStudentEmail = createCallable(
  registerStudentEmailSchema,
  async ({ data, authEmail }) => {
    const db = getFirestore();
    const studentRef = db.collection("students").doc(normalizeStudentId(data.studentId));
    const studentSnap = await studentRef.get();

    if (!studentSnap.exists) {
      throw domainError("IDENTITY_MISMATCH", "학번 또는 이름이 일치하지 않습니다.");
    }

    const student = studentSnap.data() as Student;
    if (student.name.trim().toLowerCase() !== data.name.trim().toLowerCase()) {
      throw domainError("IDENTITY_MISMATCH", "학번 또는 이름이 일치하지 않습니다.");
    }

    if (student.email !== null) {
      throw domainError("EMAIL_ALREADY_REGISTERED", "이미 이메일이 등록된 학번입니다.");
    }

    const duplicateEmail = await db
      .collection("students")
      .where("email", "==", authEmail)
      .limit(1)
      .get();
    if (!duplicateEmail.empty) {
      throw domainError("EMAIL_ALREADY_IN_USE", "이미 다른 학번에 등록된 이메일입니다.");
    }

    await studentRef.update({ email: authEmail });
    return { ok: true as const };
  },
);
