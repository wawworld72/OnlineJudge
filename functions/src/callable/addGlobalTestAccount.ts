import { getFirestore } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { addGlobalTestAccountSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { normalizeStudentId } from "../shared/identity";
import { domainError } from "../shared/errors";
import type { Student } from "../models/types";

/**
 * 실제 학생 계정 없이 어떤 퀴즈든(Classroom 연동 여부·분반과 무관) 학생 화면
 * (입장→문제 실행→제출)을 교사가 직접 테스트할 수 있도록, `students`에
 * `isGlobalTestAccount: true` 문서를 하나 등록한다. 분반(courseId)별로 따로
 * 등록할 필요 없이 이 이메일로 로그인하면 `enterQuiz.ts`가 항상 테스트
 * 참가자로 인식한다(`resolveGlobalTestAccount`, identity.ts). 이미 그
 * studentId로 된 `students` 문서가 있으면 실제 학생 데이터를 덮어쓰지 않도록
 * 거부한다.
 */
export const addGlobalTestAccount = createCallable(
  addGlobalTestAccountSchema,
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
      isGlobalTestAccount: true,
    } satisfies Student);
    return { ok: true as const };
  },
);
