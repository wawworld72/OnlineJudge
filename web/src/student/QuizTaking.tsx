import { useEffect, useState } from "react";
import { CEditor } from "../editor/CEditor";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { formatRemaining, startCountdown } from "../shared/countdown";
import { finalSubmit, practiceRun, type EnterQuizResponse, type PracticeRunResponse } from "./api";
import { FinalSubmitModal } from "./FinalSubmitModal";
import { Markdown } from "./Markdown";
import { ResultView } from "./ResultView";
import { TcResultTable } from "./TcResultTable";

interface QuizTakingProps {
  quizId: string;
  initial: EnterQuizResponse;
}

function codeStorageKey(quizId: string, problemId: string): string {
  return `code:${quizId}:${problemId}`;
}

function tabStatusClass(run: PracticeRunResponse | undefined): string {
  if (!run) return "";
  if (run.maxScore > 0 && run.score >= run.maxScore) return "status-perfect";
  if (run.score > 0) return "status-partial";
  return "status-failed";
}

/**
 * 문항 탭 + 코드 에디터 + 실행/제출 + 카운트다운 화면(FR-013~019). 코드는 서버에 저장하지
 * 않고 로컬 저장소에만 자동저장한다(헌법 IV) — 서버 쓰기는 최종 제출 시점 1회뿐이다.
 */
export function QuizTaking({ quizId, initial }: QuizTakingProps) {
  const [participantStatus, setParticipantStatus] = useState(initial.participantStatus);
  const [activeIndex, setActiveIndex] = useState(0);
  const [descHidden, setDescHidden] = useState(false);
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
  const [testedCodeByProblem, setTestedCodeByProblem] = useState<Record<string, string>>({});
  const [remainingMs, setRemainingMs] = useState(0);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => startCountdown(initial.endAt, setRemainingMs), [initial.endAt]);

  const activeProblem = initial.problems[activeIndex];

  if (participantStatus !== "IN_PROGRESS") {
    return <ResultView quizId={quizId} initialStatus={participantStatus} />;
  }

  if (!activeProblem) return null;

  const ended = remainingMs <= 0;
  const maxRuns = activeProblem.maxRuns;
  const remaining = remainingRuns[activeProblem.problemId] ?? maxRuns;
  const runCountClass = maxRuns > 0 && remaining <= 0 ? "danger" : maxRuns > 0 && remaining <= 3 ? "warn" : "";

  function updateCode(problemId: string, code: string) {
    setCodeByProblem((prev) => ({ ...prev, [problemId]: code }));
    localStorage.setItem(codeStorageKey(quizId, problemId), code);
  }

  async function runActiveProblem() {
    if (ended) return;
    setRunError(null);
    const code = codeByProblem[activeProblem!.problemId] ?? "";
    try {
      const result = await practiceRun({ quizId, problemId: activeProblem!.problemId, code });
      setLastRunByProblem((prev) => ({ ...prev, [activeProblem!.problemId]: result }));
      setTestedCodeByProblem((prev) => ({ ...prev, [activeProblem!.problemId]: code }));
      setRemainingRuns((prev) => ({ ...prev, [activeProblem!.problemId]: result.remainingRuns }));
    } catch {
      setRunError("실행에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
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
  const currentCode = (codeByProblem[activeProblem.problemId] ?? "").trim();
  const isStale = !!lastRun && testedCodeByProblem[activeProblem.problemId] !== currentCode;

  return (
    <div className="container">
      <div className="card">
        <h1>{"퀴즈 풀이"}</h1>

        {remainingMs > 0 && remainingMs <= 60 * 1000 && (
          <div className="time-warning-banner danger">1분 미만 남았습니다. 지금 제출하세요.</div>
        )}
        {remainingMs > 60 * 1000 && remainingMs <= 5 * 60 * 1000 && (
          <div className="time-warning-banner warn">5분 미만 남았습니다. 제출을 준비하세요.</div>
        )}
        {ended && <div className="time-warning-banner danger">제출 시간이 종료되었습니다.</div>}

        <div className="top-info">
          <div>
            <b>남은 시간:</b> <span className={ended ? "remaining-time danger" : "remaining-time"}>
              {formatRemaining(remainingMs)}
            </span>
          </div>
        </div>

        <div className="problem-tabs">
          {initial.problems.map((problem, index) => {
            const run = lastRunByProblem[problem.problemId];
            const active = index === activeIndex ? "active" : "";
            return (
              <button
                key={problem.problemId}
                className={`problem-tab ${active} ${tabStatusClass(run)}`.trim()}
                onClick={() => setActiveIndex(index)}
              >
                {problem.title}
                <span className="tab-meta">
                  {problem.maxRuns > 0
                    ? `실행: ${problem.maxRuns - (remainingRuns[problem.problemId] ?? problem.maxRuns)}/${problem.maxRuns}회`
                    : ""}
                  {run ? ` | ${run.score}/${run.maxScore}점(예상)` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{activeProblem.title}</h2>
          <button className="secondary" onClick={() => setDescHidden((v) => !v)}>
            {descHidden ? "문제 보기" : "문제 숨기기"}
          </button>
        </div>

        <div className="problem-content" style={descHidden ? { gridTemplateColumns: "1fr" } : undefined}>
          {!descHidden && <Markdown text={activeProblem.description} />}

          <div className="problem-editor-panel">
            <div className="editor-shell">
              <CEditor
                value={codeByProblem[activeProblem.problemId] ?? ""}
                onChange={(code) => updateCode(activeProblem.problemId, code)}
                readOnly={ended}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <DelayedActionButton
                label="실행"
                pendingLabel="실행 중..."
                delayedLabel="채점이 지연되고 있습니다..."
                onAction={runActiveProblem}
              />
              {maxRuns > 0 && (
                <span className={`run-count-box ${runCountClass}`.trim()}>
                  <span className="run-count-label">남은 실행 횟수:</span> {remaining} / {maxRuns}회
                </span>
              )}
            </div>

            {runError && <p className="error">{runError}</p>}
            {isStale && <p className="warning">코드가 마지막 실행 후 수정되었습니다. 다시 실행해보세요.</p>}

            {lastRun?.status === "CE" ? (
              <div className="compile-error-box">
                <b>컴파일 오류</b>
                <pre>{lastRun.compileErrorMessage}</pre>
              </div>
            ) : lastRun ? (
              <>
                <p>
                  실행 결과: {lastRun.score} / {lastRun.maxScore}점
                  {lastRun.usedCache && " · 같은 코드의 이전 결과를 사용했습니다(횟수 차감 없음)."}
                </p>
                <TcResultTable tcResults={lastRun.tcResults} />
              </>
            ) : (
              <div className="result-box muted">실행 결과가 없습니다.</div>
            )}
          </div>
        </div>

        <button className="danger" onClick={() => setShowSubmitModal(true)} disabled={ended}>
          최종 제출
        </button>
      </div>

      {showSubmitModal && (
        <FinalSubmitModal
          problems={initial.problems.map((p) => {
            const code = (codeByProblem[p.problemId] ?? "").trim();
            const run = lastRunByProblem[p.problemId];
            return {
              problemId: p.problemId,
              title: p.title,
              hasCode: code.length > 0,
              hasRun: !!run,
              isStale: !!run && testedCodeByProblem[p.problemId] !== code,
            };
          })}
          onCancel={() => setShowSubmitModal(false)}
          onConfirm={confirmFinalSubmit}
        />
      )}
    </div>
  );
}
