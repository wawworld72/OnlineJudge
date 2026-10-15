import type { FocusStage } from "./focusGuardState";

interface FocusGuardOverlayProps {
  stage: FocusStage;
  away: boolean;
  onAcknowledge: () => void;
}

/** 화면 이탈 경고: 1단계는 상단 배너, 2단계는 주황색으로 점멸하는 전체 화면 오버레이. */
export function FocusGuardOverlay({ stage, away, onAcknowledge }: FocusGuardOverlayProps) {
  if (stage === 0) return null;

  if (stage === 1) {
    return (
      <div className="focus-guard-banner" role="alert">
        ⚠ 시험 화면을 벗어난 것이 감지되었습니다. 이탈 기록은 교사에게 전달됩니다.
      </div>
    );
  }

  return (
    <div className="focus-guard-overlay" role="alertdialog" aria-modal="true">
      <div className="focus-guard-box">
        <h2>⚠ 시험 화면 이탈 경고</h2>
        <p>
          시험 화면을 벗어난 상태가 계속되었습니다. 이탈 횟수와 시간이 교사에게 기록되며, 부정행위로
          판단될 수 있습니다.
        </p>
        <button onClick={onAcknowledge} disabled={away}>
          {away ? "시험 화면으로 돌아오세요" : "확인했습니다"}
        </button>
      </div>
    </div>
  );
}
