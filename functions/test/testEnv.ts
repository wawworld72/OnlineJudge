import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { DecodedIdToken } from "firebase-admin/auth";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GRADER_SERVICE_URL ??= "http://127.0.0.1:9999";
process.env.GRADER_AUTH_TOKEN ??= "test-grader-token";
process.env.ALLOWED_EMAIL_DOMAIN ??= "hoseo.edu";
process.env.TEACHER_EMAILS ??= "teacher@hoseo.edu";

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

export function ts(msFromNow: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + msFromNow);
}
