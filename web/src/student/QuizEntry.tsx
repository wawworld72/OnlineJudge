import { useState } from "react";
import { useParams } from "react-router-dom";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { getErrorCode } from "../shared/functionsClient";
import { enterQuiz, registerStudentEmail, type EnterQuizResponse } from "./api";
import { QuizTaking } from "./QuizTaking";

/**
 * 입장 화면(FR-009~011). 이메일 미등록 학번은 `NEEDS_EMAIL_REGISTRATION` 오류로 등록
 * 플로우로 분기하고, 등록이 끝나면 원래 시도하던 입장을 그대로 이어서 진행한다.
 */
export function QuizEntry() {
  const { quizId } = useParams<{ quizId: string }>();
  const [accessCode, setAccessCode] = useState("");
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [needsEmailRegistration, setNeedsEmailRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<EnterQuizResponse | null>(null);

  if (!quizId) return null;

  if (entered) {
    return <QuizTaking quizId={quizId} initial={entered} />;
  }

  async function attemptEntry() {
    setError(null);
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
    <div>
      <h1>퀴즈 입장</h1>
      <label>
        출입코드
        <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
      </label>
      <label>
        학번
        <input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
      </label>
      <label>
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {needsEmailRegistration ? (
        <div>
          <p>최초 입장입니다. 로그인한 이메일을 이 학번에 등록할까요?</p>
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

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
