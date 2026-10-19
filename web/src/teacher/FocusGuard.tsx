import { setFocusGuard } from "./api";

interface FocusGuardProps {
  quizId: string;
  focusGuardEnabled: boolean;
  onChanged: () => void;
}

/**
 * 응시 화면 이탈 감지(1단계 경고 → 5초 이상 이탈 시 2단계 화면 주황색 전환 + 서버 기록)를 켜고
 * 끄는 토글(부정행위 방지). 브라우저 JS로만 감지하는 억제책이라 완전한 차단은 아니다.
 */
export function FocusGuard({ quizId, focusGuardEnabled, onChanged }: FocusGuardProps) {
  async function toggle(checked: boolean) {
    await setFocusGuard({ quizId, enabled: checked });
    onChanged();
  }

  return (
    <div>
      <h3>화면 이탈 감지</h3>
      <label>
        <input
          type="checkbox"
          checked={focusGuardEnabled}
          onChange={(e) => toggle(e.target.checked)}
        />
        응시 중 다른 탭·창으로 벗어나면 경고하고 이탈 기록을 남김
      </label>
      <p className="field-hint">
        켜면 학생이 시험 화면을 벗어나는 즉시 경고가 나오고, 한 번의 이탈이 5초 이상 이어지면 화면이
        주황색으로 바뀝니다. 이탈 횟수·시간은 참가자 현황에서 확인할 수 있습니다. 브라우저
        기능으로만 감지하는 억제책이라 개발자 도구나 다른 기기를 쓰는 것까지 막지는 못하며, 이탈한
        채 탭을 닫거나 네트워크가 끊기면 그 이탈은 기록되지 않습니다. 복기 화면에는 적용되지
        않습니다.
      </p>
    </div>
  );
}
