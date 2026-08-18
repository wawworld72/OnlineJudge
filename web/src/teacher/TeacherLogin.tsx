import { useState, type FormEvent } from "react";
import { getAuth, signInAnonymously, signOut } from "firebase/auth";
import { firebaseApp } from "../shared/firebaseApp";
import { getErrorCode } from "../shared/functionsClient";
import { teacherLogin } from "./api";

const auth = getAuth(firebaseApp);

/**
 * "/teacher"의 유일한 진입점. Google 이메일 로그인이 아니라 공유 출입코드로 접근한다
 * (functions/src/callable/teacherLogin.ts). 익명 인증으로 로그인한 뒤 서버에 출입코드를
 * 검증받아 커스텀 클레임 `teacher: true`를 받으면, 그 클레임이 이번 세션의 ID 토큰에
 * 반영되도록 새로고침한다 — App.tsx가 다시 로드되면서 isTeacher를 다시 읽어 QuizManager로
 * 넘어간다(가장 단순하고 확실한 방법).
 */
export function TeacherLogin() {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      // 이미 학생(Google) 계정으로 로그인해 있는 브라우저일 수 있다 — 그 계정에
      // teacher 클레임이 붙어버리지 않도록, 교사 로그인은 항상 별도의 익명 계정으로
      // 새로 시작한다.
      if (!auth.currentUser || !auth.currentUser.isAnonymous) {
        if (auth.currentUser) await signOut(auth);
        await signInAnonymously(auth);
      }
      await teacherLogin({ accessCode });
      await auth.currentUser!.getIdToken(true);
      location.reload();
    } catch (cause) {
      const code = getErrorCode(cause);
      setError(
        code === "INVALID_ACCESS_CODE"
          ? "출입코드가 일치하지 않습니다."
          : "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
      setPending(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>교사 로그인</h1>
        <form onSubmit={handleSubmit}>
          <label>
            출입코드
            <input
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoFocus
            />
          </label>
          <button type="submit" disabled={pending || !accessCode}>
            {pending ? "확인 중..." : "로그인"}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
