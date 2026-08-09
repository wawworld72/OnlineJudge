import type { Firestore } from "firebase-admin/firestore";
import type { Student } from "../models/types";
import { domainError } from "./errors";

interface IdentityInput {
  studentId: string;
  name: string;
  authEmail: string;
}

interface IdentityResult {
  studentId: string;
  student: Student;
}

/**
 * 학번+이름+이메일 3중 대조(FR-009, 헌법 II). 이메일이 아직 등록되지 않은 학번은
 * 여기서 거부하지 않고 `NEEDS_EMAIL_REGISTRATION` 결과로 구분해 반환한다 — 호출자가
 * 등록 플로우로 분기할지, 실패로 처리할지 결정한다(FR-011).
 */
export async function verifyStudentIdentity(
  db: Firestore,
  { studentId, name, authEmail }: IdentityInput,
): Promise<IdentityResult> {
  const snap = await db.collection("students").doc(studentId).get();
  if (!snap.exists) {
    throw domainError("IDENTITY_MISMATCH", "학번 또는 이름이 일치하지 않습니다.");
  }

  const student = snap.data() as Student;

  if (student.status !== "ACTIVE" || student.name !== name) {
    throw domainError("IDENTITY_MISMATCH", "학번 또는 이름이 일치하지 않습니다.");
  }

  if (student.email === null) {
    throw domainError(
      "NEEDS_EMAIL_REGISTRATION",
      "최초 입장입니다. 이메일 등록이 필요합니다.",
    );
  }

  if (student.email !== authEmail) {
    throw domainError("IDENTITY_MISMATCH", "학번 또는 이름이 일치하지 않습니다.");
  }

  return { studentId, student };
}

/**
 * `practiceRun`/`finalSubmit`/`getMyResult`는 요청에 `studentId`를 담지 않는다(입장 시
 * 이미 3중 대조를 통과했으므로 매 호출마다 다시 요구하지 않음). 대신 로그인 이메일로
 * `students` 문서를 조회해 학번을 역으로 확인한다 — 클라이언트가 studentId를 보내더라도
 * 신뢰하지 않는다는 원칙(헌법 I)의 연장선이다.
 */
export async function resolveStudentIdByEmail(db: Firestore, authEmail: string): Promise<string> {
  const snap = await db.collection("students").where("email", "==", authEmail).limit(1).get();
  if (snap.empty) {
    throw domainError("IDENTITY_MISMATCH", "학번 또는 이름이 일치하지 않습니다.");
  }
  return snap.docs[0]!.id;
}
