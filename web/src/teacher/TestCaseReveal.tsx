import { setTestCaseReveal } from "./api";

interface TestCaseRevealProps {
  quizId: string;
  revealTestCases: boolean;
  onChanged: () => void;
}

/**
 * 퀴즈가 CLOSED된 뒤 학생 결과 화면에서 비공개 테스트케이스(input/expected)까지
 * 공개할지 켜고 끄는 토글(FR과 무관, 사용자 요청으로 추가). 실제 공개는
 * `getMyResult.ts`가 `status === "CLOSED"`일 때만 반영하므로, 여기서는 OPEN
 * 상태에서 미리 켜둬도 안전하다.
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
        퀴즈 종료 후 비공개 테스트케이스 공개(입력·기대 출력)
      </label>
      <p className="field-hint">
        켜면 퀴즈가 마감된 뒤 학생 본인의 결과 화면에서 비공개 테스트케이스의 입력·기대 출력까지 볼
        수 있게 됩니다(본인이 제출한 코드의 실제 출력은 채점 시점에 저장되지 않아 공개되지
        않습니다). 같은 문제를 다른 분반 퀴즈에도 재사용 중이라면, 그 분반이 모두 끝나기 전에는 켜지
        마세요 — 아직 문제를 안 본 다른 분반 학생에게 답이 유출될 수 있습니다.
      </p>
    </div>
  );
}
