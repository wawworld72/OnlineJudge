import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { firebaseApp } from "./shared/firebaseApp";
import { Login } from "./shared/Login";
import { QuizList } from "./student/QuizList";
import { QuizEntry } from "./student/QuizEntry";
import { QuizManager } from "./teacher/QuizManager";
import { TeacherLogin } from "./teacher/TeacherLogin";
import "./student/student.css";

const auth = getAuth(firebaseApp);

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      // 교사 여부는 이메일 허용목록이 아니라 teacherLogin이 부여한 커스텀 클레임으로만
      // 판별한다(/teacher, functions/src/callable/teacherLogin.ts) — 학생 Google
      // 계정에는 이 클레임이 없다.
      const claims = nextUser ? (await nextUser.getIdTokenResult()).claims : null;
      setIsTeacher(claims?.teacher === true);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  const studentGate = !user || !user.email ? <Login /> : undefined;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/teacher" element={isTeacher ? <QuizManager /> : <TeacherLogin />} />
        <Route path="/" element={studentGate ?? <QuizList />} />
        <Route path="/quiz/:quizId" element={studentGate ?? <QuizEntry />} />
      </Routes>
    </BrowserRouter>
  );
}
