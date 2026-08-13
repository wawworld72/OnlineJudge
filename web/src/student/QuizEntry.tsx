import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "../shared/firestoreClient";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { getErrorCode } from "../shared/functionsClient";
import { enterQuiz, registerStudentEmail, type EnterQuizResponse } from "./api";
import { QuizTaking } from "./QuizTaking";

interface QuizInfo {
  title: string;
  description: string;
  endAt: number;
}

/**
 * 입장 화면(FR-009~011). 이메일 미등록 학번은 `NEEDS_EMAIL_REGISTRATION` 오류로 등록
 * 플로우로 분기하고, 등록이 끝나면 원래 시도하던 입장을 그대로 이어서 진행한다.
 */
export function QuizEntry() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [quizInfo, setQuizInfo] = useState<QuizInfo | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [studentId, setStudentId] = useState(() => localStorage.getItem("cquiz_studentId") ?? "");
  const [name, setName] = useState(() => localStorage.getItem("cquiz_studentName") ?? "");
  const [needsEmailRegistration, setNeedsEmailRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<EnterQuizResponse | null>(null);

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
    localStorage.setItem("cquiz_studentId", studentId);
    localStorage.setItem("cquiz_studentName", name);
    try {
      const response = await enterQuiz({ quizId: quizId!, accessCode, studentId, name });
      setNeedsEmailRegistration(false);
      setEntered(response);
    } catch (err) {
      if (getErrorCode(err) === "NEEDS_EMAIL_REGISTRATION") {
        setNeedsEmailRegistration(true);
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
        <button className="secondary" onClick={() => navigate("/")}>
          ← 목록
        </button>

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
