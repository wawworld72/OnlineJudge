import { useEffect, useState } from "react";
import { CEditor } from "../editor/CEditor";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { formatRemaining, startCountdown } from "../shared/countdown";
import { finalSubmit, practiceRun, type EnterQuizResponse, type PracticeRunResponse } from "./api";
import { FinalSubmitModal } from "./FinalSubmitModal";
import { ResultView } from "./ResultView";

interface QuizTakingProps {
  quizId: string;
  initial: EnterQuizResponse;
}

function codeStorageKey(quizId: string, problemId: string): string {
  return `code:${quizId}:${problemId}`;
}

/**
 * 문항 탭 + 코드 에디터 + 실행/제출 + 카운트다운 화면(FR-013~019). 코드는 서버에 저장하지
 * 않고 로컬 저장소에만 자동저장한다(헌법 IV) — 서버 쓰기는 최종 제출 시점 1회뿐이다.
 */
export function QuizTaking({ quizId, initial }: QuizTakingProps) {
  const [participantStatus, setParticipantStatus] = useState(initial.participantStatus);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remainingRuns, setRemainingRuns] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.problems.map((p) => [p.problemId, p.remainingRuns])),
  );
  const [codeByProblem, setCodeByProblem] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial.problems.map((p) => [
        p.problemId,
        localStorage.getItem(codeStorageKey(quizId, p.problemId)) ?? p.initialCode,
      ]),
    ),
  );
  const [lastRunByProblem, setLastRunByProblem] = useState<Record<string, PracticeRunResponse>>({});
  const [remainingMs, setRemainingMs] = useState(0);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  useEffect(() => startCountdown(initial.endAt, setRemainingMs), [initial.endAt]);

  const activeProblem = initial.problems[activeIndex];

  if (participantStatus !== "IN_PROGRESS") {
    return <ResultView quizId={quizId} initialStatus={participantStatus} />;
  }

  if (!activeProblem) return null;

  function updateCode(problemId: string, code: string) {
    setCodeByProblem((prev) => ({ ...prev, [problemId]: code }));
    localStorage.setItem(codeStorageKey(quizId, problemId), code);
  }

  async function runActiveProblem() {
    const result = await practiceRun({
      quizId,
      problemId: activeProblem!.problemId,
      code: codeByProblem[activeProblem!.problemId] ?? "",
    });
    setLastRunByProblem((prev) => ({ ...prev, [activeProblem!.problemId]: result }));
    setRemainingRuns((prev) => ({ ...prev, [activeProblem!.problemId]: result.remainingRuns }));
  }

  async function confirmFinalSubmit() {
    const submissions = initial.problems.map((p) => ({
      problemId: p.problemId,
      code: codeByProblem[p.problemId] ?? "",
    }));
    await finalSubmit({ quizId, submissions });
    setParticipantStatus("SUBMITTED");
  }

  const lastRun = lastRunByProblem[activeProblem.problemId];

  return (
    <div>
      <p>남은 시간: {formatRemaining(remainingMs)}</p>

      <nav>
        {initial.problems.map((problem, index) => (
          <button key={problem.problemId} onClick={() => setActiveIndex(index)} disabled={index === activeIndex}>
            {problem.title}
          </button>
        ))}
      </nav>

      <h2>{activeProblem.title}</h2>
      <p>{activeProblem.description}</p>
      <p>남은 실행 횟수: {remainingRuns[activeProblem.problemId] ?? 0}</p>

      <CEditor
        value={codeByProblem[activeProblem.problemId] ?? ""}
        onChange={(code) => updateCode(activeProblem.problemId, code)}
      />

      <DelayedActionButton
        label="실행"
        pendingLabel="실행 중..."
        delayedLabel="실행에 시간이 걸리고 있습니다..."
        onAction={runActiveProblem}
      />

      {lastRun && (
        <div>
          <p>결과: {lastRun.status}</p>
          <p>
            점수: {lastRun.score} / {lastRun.maxScore}
          </p>
          {lastRun.compileErrorMessage && <pre>{lastRun.compileErrorMessage}</pre>}
          <ul>
            {lastRun.tcResults.map((tc) => (
              <li key={tc.tcId}>{tc.passed ? "통과" : "실패"}</li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={() => setShowSubmitModal(true)}>최종 제출</button>

      {showSubmitModal && (
        <FinalSubmitModal
          problems={initial.problems.map((p) => ({
            problemId: p.problemId,
            title: p.title,
            hasCode: (codeByProblem[p.problemId] ?? "").trim().length > 0,
          }))}
          onCancel={() => setShowSubmitModal(false)}
          onConfirm={confirmFinalSubmit}
        />
      )}
    </div>
  );
}
