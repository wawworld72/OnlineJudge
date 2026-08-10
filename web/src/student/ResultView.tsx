import { useEffect, useState } from "react";
import { getMyResult, type GetMyResultResponse } from "./api";
import { TcResultTable } from "./TcResultTable";

interface ResultViewProps {
  quizId: string;
  initialStatus: GetMyResultResponse["participantStatus"];
}

/**
 * 제출 완료 후 화면(FR-024). `FINALIZED` 이전에는 점수를 노출하지 않는다 — 서버 응답 자체가
 * 그 전에는 점수 필드를 담지 않으므로 여기서 추가로 감출 필요가 없다.
 */
export function ResultView({ quizId, initialStatus }: ResultViewProps) {
  const [result, setResult] = useState<GetMyResultResponse>({ participantStatus: initialStatus });

  useEffect(() => {
    getMyResult({ quizId }).then(setResult);
  }, [quizId]);

  if (result.participantStatus !== "FINALIZED") {
    return (
      <div className="container">
        <div className="card">
          <p>제출이 완료되었습니다. 채점이 끝나면 결과를 확인할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="final-banner">
          채점이 완료되었습니다. 확정 점수: {result.finalTotal} / {result.maxTotal}점
        </div>

        {result.perProblem?.map((problem) => (
          <div key={problem.problemId} style={{ marginBottom: 16 }}>
            <h3>
              {problem.problemId} — {problem.status} ({problem.score} / {problem.maxScore}점)
            </h3>
            <TcResultTable tcResults={problem.tcResults} />
          </div>
        ))}
      </div>
    </div>
  );
}
