import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../shared/firestoreClient";
import { firebaseApp } from "../shared/firebaseApp";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { getErrorCode } from "../shared/functionsClient";
import { enterQuiz, registerStudentEmail, type EnterQuizResponse } from "./api";
import { QuizTaking } from "./QuizTaking";

interface QuizInfo {
  title: string;
  description: string;
  endAt: number;
  courseId: string | null;
}

/**
 * 입장 화면(FR-009~011). Classroom 연동 퀴즈(quizInfo.courseId 있음)는 "Classroom에
 * 등록된 학생은 이미 검증됐다"는 전제로 학번/이름을 입력받지 않고 로그인 이메일로 명부에서
 * 바로 신원을 찾는다(enterQuiz.ts) — 문제가 있는 학생은 교사가 Classroom에서 직접
 * 제외한다. courseId를 아직 모를 때(quizInfo 로딩 전/실패)는 안전하게 두 필드를 모두
 * 보여준다 — Classroom 연동 퀴즈라도 백엔드가 학번/이름을 그냥 무시하고 명부로만
 * 판단하므로 해롭지 않다. 비연동 퀴즈는 이메일 미등록 학번을 `NEEDS_EMAIL_REGISTRATION`
 * 오류로 등록 플로우로 분기하고, 등록이 끝나면 원래 시도하던 입장을 그대로 이어간다.
 */
export function QuizEntry() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromList = (location.state as { fromList?: boolean } | null)?.fromList === true;
  const loggedInEmail = getAuth(firebaseApp).currentUser?.email ?? "";
  const [quizInfo, setQuizInfo] = useState<QuizInfo | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [studentId, setStudentId] = useState(() => localStorage.getItem("cquiz_studentId") ?? "");
  const [name, setName] = useState(() => localStorage.getItem("cquiz_studentName") ?? "");
  const [needsEmailRegistration, setNeedsEmailRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<EnterQuizResponse | null>(null);

  const isClassroomLinked = quizInfo?.courseId != null;

  useEffect(() => {
    if (!quizId) return;
    // 응시 화면 표시용 정보일 뿐이라 실패해도 조용히 무시한다 — 입장 자체는
    // enterQuiz Callable Function이 다시 전부 검증한다.
    getDoc(doc(db, "quizzes", quizId))
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setQuizInfo({
          title: data.title,
          description: data.description,
          endAt: (data.endAt as Timestamp).toMillis(),
          courseId: data.courseId ?? null,
        });
      })
      .catch(() => {});
  }, [quizId]);

  if (!quizId) return null;

  if (entered) {
    return <QuizTaking quizId={quizId} initial={entered} />;
  }

  async function attemptEntry() {
    setError(null);
    if (!isClassroomLinked) {
      localStorage.setItem("cquiz_studentId", studentId);
      localStorage.setItem("cquiz_studentName", name);
    }
    try {
      const response = await enterQuiz(
        isClassroomLinked
          ? { quizId: quizId!, accessCode }
          : { quizId: quizId!, accessCode, studentId, name },
      );
      setNeedsEmailRegistration(false);
      setEntered(response);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === "NEEDS_EMAIL_REGISTRATION") {
        setNeedsEmailRegistration(true);
        return;
      }
      if (code === "NOT_IN_CLASSROOM_ROSTER") {
        setError("이 강의 수강생 명부에서 로그인 계정을 찾을 수 없습니다. 담당 교사에게 문의해주세요.");
        return;
      }
      setError("출입코드 또는 학번·이름을 확인해주세요.");
    }
  }

  async function confirmEmailRegistration() {
    setError(null);
    try {
      await registerStudentEmail({ studentId, name });
      await attemptEntry();
    } catch {
      setError("이메일 등록에 실패했습니다. 학번·이름을 다시 확인해주세요.");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>OJHG</h1>
        {fromList && (
          <button className="secondary" onClick={() => navigate("/")}>
            ← 목록
          </button>
        )}

        <p className="quiz-meta">
          <b>현재 로그인 이메일:</b> {loggedInEmail || "(확인 불가)"}
        </p>

        {quizInfo && (
          <div className="selected-quiz-info">
            <h3>{quizInfo.title}</h3>
            {quizInfo.description && <p className="quiz-meta">{quizInfo.description}</p>}
          </div>
        )}

        <label>
          출입코드
          <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
        </label>

        {!isClassroomLinked && (
          <>
            <label>
              학번
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
              <p className="field-hint">
                Classroom 계정 이메일의 @ 앞부분과 정확히 같아야 합니다 (예: 학번 계정이면 학번,
                개인 계정이면 그 계정명).
              </p>
            </label>
            <label>
              이름
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </>
        )}

        {needsEmailRegistration ? (
          <div>
            <p className="warning" style={{ whiteSpace: "pre-wrap" }}>
              최초 입장입니다. 로그인한 이메일을 이 학번에 등록할까요?{"\n"}
              (등록 후에는 직접 변경할 수 없습니다.)
            </p>
            <DelayedActionButton
              label="이메일 등록하고 입장"
              pendingLabel="등록 중..."
              delayedLabel="등록에 시간이 걸리고 있습니다..."
              onAction={confirmEmailRegistration}
            />
          </div>
        ) : (
          <DelayedActionButton
            label="입장"
            pendingLabel="입장 중..."
            delayedLabel="입장에 시간이 걸리고 있습니다. 잠시만 기다려주세요..."
            onAction={attemptEntry}
          />
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
