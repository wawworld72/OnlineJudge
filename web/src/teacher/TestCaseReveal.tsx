import { setTestCaseReveal } from "./api";

interface TestCaseRevealProps {
  quizId: string;
  revealTestCases: boolean;
  onChanged: () => void;
}

/**
 * 학생이 최종 제출을 마친 뒤 결과 화면에서 비공개 테스트케이스(입력·기대 출력)까지 자동
 * 공개할지 켜고 끄는 토글(안전장치). 실제 공개 여부는 `getMyResult.ts`가 호출될 때마다 이
 * 값을 읽어 결정한다.
 */
export function TestCaseReveal({ quizId, revealTestCases, onChanged }: TestCaseRevealProps) {
  async function toggle(checked: boolean) {
    await setTestCaseReveal({ quizId, revealed: checked });
    onChanged();
  }

  return (
    <div>
      <h3>테스트케이스 공개</h3>
      <label>
        <input
          type="checkbox"
          checked={revealTestCases}
          onChange={(e) => toggle(e.target.checked)}
        />
        최종 제출 후 비공개 테스트케이스 공개(입력·기대 출력)
      </label>
      <p className="field-hint">
        켜면 학생이 최종 제출을 마치는 즉시, 본인 결과 화면에서 모든 테스트케이스(비공개 포함)의
        입력·기대 출력을 볼 수 있습니다(채점 전에도 보이며, 본인 코드의 실제 출력은 채점 시점에
        저장되지 않아 공개되지 않습니다). 먼저 제출한 학생이 아직 응시 중인 학생에게 테스트케이스를
        알려줄 수 있고, 같은 문제를 다른 분반 퀴즈에 재사용 중이면 그 분반 학생에게도 유출될 수
        있으니, 그런 경우에는 꺼 두세요.
      </p>
    </div>
  );
}
