import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { firebaseApp } from "./firebaseApp";

const functions = getFunctions(firebaseApp);

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export interface FunctionErrorDetails {
  code?: string;
}

/**
 * Callable Functions 공용 호출 래퍼. 서버가 던진 `HttpsError`의 `details.code`(도메인
 * 오류 코드, contracts/callable-functions.md)를 꺼내 화면이 분기할 수 있게 한다.
 */
export async function callFunction<Req, Res>(name: string, data: Req): Promise<Res> {
  const callable = httpsCallable<Req, Res>(functions, name);
  const result = await callable(data);
  return result.data;
}

export function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "details" in error &&
    typeof (error as { details?: unknown }).details === "object"
  ) {
    const details = (error as { details?: FunctionErrorDetails }).details;
    return details?.code;
  }
  return undefined;
}
