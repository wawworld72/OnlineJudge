import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { firebaseApp } from "./firebaseApp";

/**
 * `quizzes`/`problems`는 firestore.rules가 `status == 'OPEN'`(및 `deletedAt == null`)인
 * 문서에 한해 클라이언트 직접 read를 허용하는 유일한 예외다(contracts/
 * firestore-access-summary.md) — 그 외 모든 조회는 Callable Function을 통해서만 이뤄진다.
 */
export const db = getFirestore(firebaseApp);

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
