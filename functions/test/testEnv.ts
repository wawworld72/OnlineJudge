import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { DecodedIdToken } from "firebase-admin/auth";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.GRADER_SERVICE_URL ??= "http://127.0.0.1:9999";
process.env.GRADER_AUTH_TOKEN ??= "test-grader-token";
process.env.ALLOWED_EMAIL_DOMAIN ??= "hoseo.edu";
process.env.TEACHER_ACCESS_CODE ??= "test-teacher-access-code";
process.env.CLASSROOM_TEACHER_EMAIL ??= "teacher@hoseo.edu";
process.env.APP_BASE_URL ??= "https://demo-c-quiz-judge-system.web.app";
process.env.SHEET_EXPORT_API_TOKEN ??= "test-sheet-export-token";

let db: Firestore | null = null;

export function testDb(): Firestore {
  if (!db) {
    const app =
      getApps().find((a) => a.name === "[DEFAULT]") ??
      initializeApp({ projectId: "demo-c-quiz-judge-system" });
    db = getFirestore(app);
  }
  return db;
}

export async function clearFirestore(): Promise<void> {
  testDb(); // 관리자 앱이 아직 초기화되지 않은 spec 파일도 있으므로 항상 먼저 보장한다.
  const projectId = "demo-c-quiz-judge-system";
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

export async function teardownTestApp(): Promise<void> {
  const app = getApps().find((a) => a.name === "[DEFAULT]");
  if (app) await deleteApp(app);
  db = null;
}

export function makeRequest<T>(data: T, email: string): CallableRequest<T> {
  return {
    data,
    auth: {
      uid: email,
      token: { email } as DecodedIdToken,
      rawToken: "test-raw-token",
    },
    rawRequest: {} as CallableRequest<T>["rawRequest"],
    acceptsStreaming: false,
  };
}

/**
 * 교사는 이메일 계정이 아니라 익명 인증 + 출입코드(`teacherLogin`)로 커스텀 클레임
 * `teacher: true`를 받는다(callableFactory.ts) — 테스트에서도 이메일이 아니라 이
 * 클레임만으로 교사 컨텍스트를 흉내낸다.
 */
export function makeTeacherRequest<T>(data: T): CallableRequest<T> {
  return {
    data,
    auth: {
      uid: "test-teacher-uid",
      token: { teacher: true } as unknown as DecodedIdToken,
      rawToken: "test-raw-token",
    },
    rawRequest: {} as CallableRequest<T>["rawRequest"],
    acceptsStreaming: false,
  };
}

/**
 * `teacherLogin` 자체를 테스트할 때 쓴다 — 아직 `teacher` 클레임을 받기 전, 실제
 * Auth 에뮬레이터에 만들어둔 익명 계정(uid)으로 호출하는 상황을 흉내낸다.
 */
export function makeAnonymousRequest<T>(data: T, uid: string): CallableRequest<T> {
  return {
    data,
    auth: {
      uid,
      token: {} as DecodedIdToken,
      rawToken: "test-raw-token",
    },
    rawRequest: {} as CallableRequest<T>["rawRequest"],
    acceptsStreaming: false,
  };
}

export function ts(msFromNow: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + msFromNow);
}
