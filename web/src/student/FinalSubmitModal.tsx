import { DelayedActionButton } from "../shared/DelayedActionButton";

interface FinalSubmitModalProps {
  problems: Array<{ problemId: string; title: string; hasCode: boolean }>;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * 최종 제출 확인 모달. 되돌릴 수 없는 동작이므로 문항별 작성 상태를 먼저 보여주고,
 * 제출 자체는 지연 UX(FR-035)로 진행한다.
 */
export function FinalSubmitModal({ problems, onCancel, onConfirm }: FinalSubmitModalProps) {
  return (
    <div role="dialog" aria-modal="true">
      <h2>최종 제출하시겠습니까?</h2>
      <p>제출 후에는 코드를 수정할 수 없습니다.</p>
      <ul>
        {problems.map((problem) => (
          <li key={problem.problemId}>
            {problem.title}: {problem.hasCode ? "작성됨" : "작성 안 됨"}
          </li>
        ))}
      </ul>
      <button onClick={onCancel}>취소</button>
      <DelayedActionButton
        label="최종 제출"
        pendingLabel="제출 중..."
        delayedLabel="제출에 시간이 걸리고 있습니다. 페이지를 닫지 마세요..."
        onAction={onConfirm}
      />
    </div>
  );
}
