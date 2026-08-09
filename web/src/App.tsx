import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { firebaseApp } from "./shared/firebaseApp";
import { Login } from "./shared/Login";

const auth = getAuth(firebaseApp);

const TEACHER_EMAILS = (import.meta.env.VITE_TEACHER_EMAILS ?? "")
  .split(",")
  .map((email: string) => email.trim())
  .filter(Boolean);

type Role = "STUDENT" | "TEACHER";

function resolveRole(email: string): Role {
  return TEACHER_EMAILS.includes(email) ? "TEACHER" : "STUDENT";
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  if (loading) return null;
  if (!user || !user.email) return <Login />;

  const role = resolveRole(user.email);

  return (
    <BrowserRouter>
      <Routes>
        {role === "STUDENT" ? (
          <Route path="/*" element={<div>학생 화면 (User Story 1에서 구현)</div>} />
        ) : (
          <Route path="/*" element={<div>교사 화면 (User Story 2에서 구현)</div>} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
