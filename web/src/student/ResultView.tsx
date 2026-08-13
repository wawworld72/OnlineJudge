import { useState } from "react";
import { CEditor } from "../editor/CEditor";
import type { EnterQuizResponse, GradedProblemResult } from "./api";
import { Markdown } from "./Markdown";
import { TcResultTable } from "./TcResultTable";

interface ResultViewProps {
  quizId: string;
  initial: EnterQuizResponse;
}

function noop() {}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tabStatusClass(result: GradedProblemResult | undefined): string {
  if (!result) return "";
  if (result.maxScore > 0 && result.score >= result.maxScore) return "status-perfect";
  if (result.score > 0) return "status-partial";
  return "status-failed";
}

/**
 * 제출완료/채점완료 후의 복기 화면(FR-024). 학생이 자기가 무엇을 냈고 왜 틀렸는지 알 수
 * 있어야 응시 화면과 똑같은 레이아웃(퀴즈 제목/학번·이름·이메일/문항 탭/문제 설명/제출했던
 * 코드/테스트케이스 결과)을 그대로 보여주되, "실행"·"최종 제출" 같은 조작은 전부 없앤
 * 읽기 전용 버전이다. 총점은 서버가 별도로 저장해둔 `finalTotal` 필드를 쓰지 않고 지금
 * 보여주는 `gradedResult`에서 직접 합산한다 — 교사가 개별 문항 점수를 수동으로 고쳤을 때
 * 상단 총점과 문항별 점수가 서로 다르게 보이는 불일치를 피하기 위함이다.
 */
export function ResultView({ quizId, initial }: ResultViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProblem = initial.problems[activeIndex];
  if (!activeProblem) return null;

  const graded = initial.gradedResult;
  const submissions = initial.existingSubmission;
  const totalMax = initial.problems.reduce((sum, p) => sum + p.pointsTotal, 0);
  const totalScore = graded
    ? Object.values(graded).reduce((sum, result) => sum + result.score, 0)
    : 0;

  const activeResult = graded?.[activeProblem.problemId];
  const activeCode = submissions?.[activeProblem.problemId]?.code ?? "";

  return (
    <div className="container">
      <div className="card">
        <h1>{initial.quizTitle}</h1>

        {initial.participantStatus === "FINALIZED" ? (
          <div className="final-banner">
            채점이 완료되었습니다. 확정 점수: {totalScore} / {totalMax}점
          </div>
        ) : (
          <div className="final-banner">
            제출이 완료되었습니다. 채점이 끝나면 테스트케이스 결과를 확인할 수 있습니다.
          </div>
        )}

        <div className="top-info">
          <div>
            <b>학번:</b> {initial.studentId}
          </div>
          <div>
            <b>퀴즈 ID:</b> {quizId}
          </div>
          <div>
            <b>이름:</b> {initial.studentName}
          </div>
          <div>
            <b>시작:</b> {formatDateTime(initial.startAt)}
          </div>
          <div>
            <b>이메일:</b> {initial.studentEmail}
          </div>
          <div>
            <b>종료:</b> {formatDateTime(initial.endAt)}
          </div>
          <div>
            <b>채점 기준:</b> 최종 제출 코드
          </div>
          <div>
            <b>상태:</b> {initial.participantStatus === "FINALIZED" ? "채점완료" : "제출완료"}
          </div>
        </div>

        <div className="problem-tabs">
          {initial.problems.map((problem, index) => {
            const result = graded?.[problem.problemId];
            const active = index === activeIndex ? "active" : "";
            return (
              <button
                key={problem.problemId}
                className={`problem-tab ${active} ${tabStatusClass(result)}`.trim()}
                onClick={() => setActiveIndex(index)}
              >
                {problem.title}
                {result && <span className="tab-meta">{result.score}/{result.maxScore}점</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>{activeProblem.title}</h2>

        <div className="problem-content">
          <Markdown text={activeProblem.description} />

          <div className="problem-editor-panel">
            <div className="editor-shell">
              <CEditor value={activeCode} onChange={noop} readOnly />
            </div>

            {!activeResult ? (
              <div className="result-box muted">채점 대기 중입니다.</div>
            ) : activeResult.status === "CE" ? (
              <div className="compile-error-box">
                <b>컴파일 오류</b>
                <pre>{activeResult.compileErrorMessage}</pre>
              </div>
            ) : (
              <>
                <p>
                  결과: {activeResult.status} ({activeResult.score} / {activeResult.maxScore}점)
                </p>
                <TcResultTable tcResults={activeResult.tcResults} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
