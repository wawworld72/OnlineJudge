import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { firebaseApp } from "./firebaseApp";

/**
 * App Check 클라이언트 초기화(research.md §6). 이 요청이 실제 배포된 웹앱에서 온 것인지
 * 검증하는 계층으로, 로그인 여부와는 별개다. 에뮬레이터/로컬 개발에서는 디버그 토큰을 쓴다 —
 * `web/src/shared/functionsClient.ts`가 Callable Function을 호출하기 전에 이 모듈이 먼저
 * 초기화되어야 한다.
 */
export function initAppCheck(): void {
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
