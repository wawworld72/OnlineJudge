import { setClipboardRestriction } from "./api";

interface ClipboardRestrictionProps {
  quizId: string;
  clipboardRestricted: boolean;
  onChanged: () => void;
}

/**
 * 응시 화면 코드 에디터에서 복사·붙여넣기·드래그로 끌어다 놓기를 막을지 켜고
 * 끄는 토글(부정행위 방지, 사용자 요청으로 추가). 브라우저 JS로만 막는
 * 억제책이라 완전한 차단은 아니다 — 복기 화면(ResultView)에는 적용되지 않는다.
 */
export function ClipboardRestriction({
  quizId,
  clipboardRestricted,
  onChanged,
}: ClipboardRestrictionProps) {
  async function toggle(checked: boolean) {
    await setClipboardRestriction({ quizId, restricted: checked });
    onChanged();
  }

  return (
    <div>
      <h3>복사·붙여넣기 제한</h3>
      <label>
        <input
          type="checkbox"
          checked={clipboardRestricted}
          onChange={(e) => toggle(e.target.checked)}
        />
        응시 화면 코드 에디터에서 복사·붙여넣기·드래그로 끌어다 놓기 제한
      </label>
      <p className="field-hint">
        켜면 학생이 코드 에디터에 붙여넣기/끌어다놓기를 할 수 없고, 에디터 내용을 복사·잘라내기도 할
        수 없습니다(문제·코드를 외부 AI 도구에 붙여넣어 도움을 받는 것을 막기 위함). 브라우저
        기능으로만 막는 억제책이라, 개발자 도구를 쓰거나 다른 화면을 보며 손으로 옮겨 적는 것까지
        막지는 못합니다. 복기 화면(제출 후 결과 보기)에는 적용되지 않습니다.
      </p>
    </div>
  );
}
