import { useEffect, useState } from "react";
import { getMyResult, type GetMyResultResponse } from "./api";

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
    return <p>제출이 완료되었습니다. 채점이 끝나면 결과를 확인할 수 있습니다.</p>;
  }

  return (
    <div>
      <h2>채점 결과</h2>
      <p>
        총점: {result.finalTotal} / {result.maxTotal}
      </p>
      <ul>
        {result.perProblem?.map((problem) => (
          <li key={problem.problemId}>
            {problem.problemId}: {problem.status} ({problem.score} / {problem.maxScore})
          </li>
        ))}
      </ul>
    </div>
  );
}
