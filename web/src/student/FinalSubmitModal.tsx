import { DelayedActionButton } from "../shared/DelayedActionButton";

interface ProblemSubmitStatus {
  problemId: string;
  title: string;
  hasCode: boolean;
  hasRun: boolean;
  isStale: boolean;
}

interface FinalSubmitModalProps {
  problems: ProblemSubmitStatus[];
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function statusLabel(problem: ProblemSubmitStatus): string {
  if (!problem.hasCode) return "미작성";
  if (!problem.hasRun) return "작성됨 (미실행)";
  if (problem.isStale) return "작성됨 (실행 후 수정됨)";
  return "작성됨";
}

/**
 * 최종 제출 확인 모달. 되돌릴 수 없는 동작이므로 문항별 작성/실행 상태를 먼저 보여주고,
 * 제출 자체는 지연 UX(FR-035)로 진행한다. "미실행"/"실행 후 수정됨"은 채점 결과가 화면에
 * 보여준 예상 점수와 실제 제출되는 코드가 다를 수 있다는 신호일 뿐 제출을 막지는 않는다 —
 * 최종 점수는 항상 서버가 제출된 코드로 다시 채점한다(헌법 I).
 */
export function FinalSubmitModal({ problems, onCancel, onConfirm }: FinalSubmitModalProps) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box">
        <h2>최종 제출하시겠습니까?</h2>
        <p className="muted">제출 후에는 코드를 실행하거나 수정할 수 없습니다.</p>
        <table className="summary-table">
          <thead>
            <tr>
              <th>문항</th>
              <th>작성 상태</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((problem) => (
              <tr key={problem.problemId}>
                <td>{problem.title}</td>
                <td>{statusLabel(problem)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>
            취소
          </button>
          <DelayedActionButton
            label="최종 제출"
            pendingLabel="제출 중..."
            delayedLabel="제출에 시간이 걸리고 있습니다. 페이지를 닫지 마세요..."
            onAction={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}
