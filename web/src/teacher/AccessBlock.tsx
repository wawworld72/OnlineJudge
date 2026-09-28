import { setAccessBlocked } from "./api";

interface AccessBlockProps {
  quizId: string;
  accessBlocked: boolean;
  onChanged: () => void;
}

/**
 * 문제 유출 방지용 비상 잠금 토글. 퀴즈 상태(OPEN/CLOSED)나 복기 여부와
 * 무관하게, 켜면 그 즉시 학생 접근을 전부 막는다(신규 입장은 물론 이미
 * 채점된 참가자가 성적을 다시 확인하러 오는 것까지). 교사의 전역 테스트
 * 계정만 예외로 계속 접근 가능하다.
 */
export function AccessBlock({ quizId, accessBlocked, onChanged }: AccessBlockProps) {
  async function toggle(checked: boolean) {
    await setAccessBlocked({ quizId, blocked: checked });
    onChanged();
  }

  return (
    <div>
      <h3>접근 차단(비상 잠금)</h3>
      <label>
        <input type="checkbox" checked={accessBlocked} onChange={(e) => toggle(e.target.checked)} />
        학생 접근 전체 차단(신규 입장·성적 확인 포함)
      </label>
      <p className="field-hint">
        켜면 퀴즈 상태(공개/마감)와 무관하게 이 퀴즈에 대한 모든 학생 접근이 즉시 막힙니다 — 아직
        응시하지 않은 학생의 신규 입장은 물론, 이미 제출·채점된 학생이 자기 성적을 확인하려는
        재입장까지 전부 차단됩니다(문제 내용이 계속 노출되는 것을 막기 위함). 같은 문제를 재사용할
        다른 분반이 아직 남아있거나, 더 이상 이 퀴즈에 누구도 접근할 필요가 없을 때 켜두세요.
      </p>
    </div>
  );
}
