import { useState } from "react";

type Phase = "IDLE" | "PENDING" | "DELAYED" | "ERROR";

const DELAYED_NOTICE_MS = 3000;

interface DelayedActionButtonProps {
  label: string;
  pendingLabel: string;
  delayedLabel: string;
  onAction: () => Promise<void>;
}

/**
 * 입장·최종 제출처럼 처리 시간이 길어질 수 있는 요청의 지연 UX(FR-035, 헌법 V·VI) —
 * 진행 중(PENDING) → 지연 안내(DELAYED) → 실패 시 재시도(ERROR)로 단계적으로 안내하며,
 * 요청이 끝나기 전까지는 버튼을 비활성화해 중복 시도를 막는다.
 */
export function DelayedActionButton({
  label,
  pendingLabel,
  delayedLabel,
  onAction,
}: DelayedActionButtonProps) {
  const [phase, setPhase] = useState<Phase>("IDLE");

  async function handleClick() {
    setPhase("PENDING");
    const delayTimer = setTimeout(() => setPhase("DELAYED"), DELAYED_NOTICE_MS);

    try {
      await onAction();
      clearTimeout(delayTimer);
      setPhase("IDLE");
    } catch {
      clearTimeout(delayTimer);
      setPhase("ERROR");
    }
  }

  const busy = phase === "PENDING" || phase === "DELAYED";
  const text =
    phase === "PENDING" ? pendingLabel : phase === "DELAYED" ? delayedLabel : label;

  return (
    <div>
      <button onClick={handleClick} disabled={busy}>
        {text}
      </button>
      {phase === "ERROR" && <p role="alert">요청에 실패했습니다. 다시 시도해주세요.</p>}
    </div>
  );
}
