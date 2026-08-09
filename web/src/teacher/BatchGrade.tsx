import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { batchGrade, type BatchGradeResponse } from "./api";

interface BatchGradeProps {
  quizId: string;
}

/**
 * 일괄 채점 실행 버튼 + 결과 요약 팝업(FR-020~023). 이미 확정된 참가자를 건너뛰므로
 * 중간에 실패해도 다시 실행해 안전하게 이어서 처리할 수 있다(FR-021).
 */
export function BatchGrade({ quizId }: BatchGradeProps) {
  const [result, setResult] = useState<BatchGradeResponse | null>(null);

  async function run() {
    const response = await batchGrade({ quizId });
    setResult(response);
  }

  return (
    <div>
      <DelayedActionButton
        label="일괄 채점 실행"
        pendingLabel="채점 중..."
        delayedLabel="채점에 시간이 걸리고 있습니다. 페이지를 닫지 마세요..."
        onAction={run}
      />

      {result && (
        <div role="dialog" aria-modal="true">
          <h3>일괄 채점 결과</h3>
          <p>처리: {result.processed}명</p>
          <p>스킵(이미 확정): {result.skipped}명</p>
          <p>실패: {result.failed}명</p>
          {result.failed > 0 && <p>실패한 학번: {result.failedParticipantIds.join(", ")}</p>}
          {result.classroomGradesPending && (
            <p role="alert">
              확정된 성적이 아직 Classroom에 반영되지 않았습니다. 성적 반영을 실행해주세요.
            </p>
          )}
          <button onClick={() => setResult(null)}>닫기</button>
        </div>
      )}
    </div>
  );
}
