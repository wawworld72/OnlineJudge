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
 * 학번(=Classroom 이메일 앞부분)을 Firestore 문서ID로 쓰기 전에 항상 통과시키는 정규화.
 * 영문 계정명은 학생이 입력할 때 대소문자를 다르게 칠 수 있는데, `syncRoster`가 저장한
 * 문서ID와 대소문자까지 정확히 같아야만 조회되면 매번 IDENTITY_MISMATCH로 튕겨나간다
 * (숫자 학번은 대소문자 문제가 없어 이 버그가 드러나지 않았음). 학번이 입력·저장되는
 * 모든 경로(`enterQuiz`/`registerStudentEmail`/`syncRoster`/`getParticipantDetail`)가
 * 반드시 이 함수를 통과시켜야 서로 같은 문서ID로 수렴한다.
 */
export function normalizeStudentId(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 이름 대조도 같은 이유로 대소문자·공백 차이를 무시한다(영문 이름 한정 실질적 영향). */
function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * 학번+이름+이메일 3중 대조(FR-009, 헌법 II). 이메일이 아직 등록되지 않은 학번은
 * 여기서 거부하지 않고 `NEEDS_EMAIL_REGISTRATION` 결과로 구분해 반환한다 — 호출자가
 * 등록 플로우로 분기할지, 실패로 처리할지 결정한다(FR-011). `studentId`는 호출자가 이미
 * `normalizeStudentId`를 적용해 넘겨야 한다.
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

  if (student.status !== "ACTIVE" || !namesMatch(student.name, name)) {
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
