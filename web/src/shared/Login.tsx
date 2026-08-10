import { useState } from "react";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { firebaseApp } from "./firebaseApp";

const ALLOWED_EMAIL_DOMAIN = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN ?? "hoseo.edu";

const auth = getAuth(firebaseApp);

export function Login() {
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const email = result.user.email ?? "";

    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      await signOut(auth);
      setError(`@${ALLOWED_EMAIL_DOMAIN} 이메일 계정으로만 로그인할 수 있습니다.`);
    }
  }

  return (
    <div>
      <button onClick={handleLogin}>Google 계정으로 로그인</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
