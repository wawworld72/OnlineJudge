import type { Firestore } from "firebase-admin/firestore";
import type { Roster, Student } from "../models/types";
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
 * Classroom 연동 퀴즈(quiz.courseId)의 입장 방식. "Classroom에 등록되어 있다면 이미
 * 검증된 학생"이라는 전제 하에, 학번·이름을 직접 입력받지 않고 로그인 이메일로 그
 * 강의의 명부(rosters, `syncRoster`가 채움)에서 바로 신원을 찾는다 — 문제가 있는
 * 학생은 교사가 Classroom에서 직접 제외하는 것으로 대응한다(자체 등록/3중대조 불필요).
 * 명부에 없으면(동기화 전이거나 그 강의 수강생이 아님) 자체 등록으로 우회하지 않고
 * 그대로 거부한다 — 그게 이 방식의 신뢰 기반이기 때문이다.
 */
export async function resolveClassroomIdentity(
  db: Firestore,
  { courseId, authEmail }: { courseId: string; authEmail: string },
): Promise<{ studentId: string; name: string }> {
  const snap = await db
    .collection("rosters")
    .where("courseId", "==", courseId)
    .where("email", "==", authEmail)
    .limit(1)
    .get();
  if (snap.empty) {
    throw domainError(
      "NOT_IN_CLASSROOM_ROSTER",
      "이 강의의 수강생 명부에서 로그인 계정을 찾을 수 없습니다. 아직 명부 동기화 전이거나 수강 정보가 다를 수 있으니 담당 교사에게 문의해주세요.",
    );
  }
  const roster = snap.docs[0]!.data() as Roster;
  return { studentId: roster.studentId, name: roster.name };
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
