import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const MIN_RATIO = 20;
const MAX_RATIO = 80;
const DEFAULT_RATIO = 50;
const KEYBOARD_STEP = 5;

function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function loadRatio(storageKey: string): number {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? clampRatio(parsed) : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

interface SplitPanelProps {
  left: ReactNode;
  right: ReactNode;
  /** 사용자가 맞춘 비율을 기억해두는 localStorage 키. 같은 키를 쓰는 화면끼리는
   *  선호 비율을 공유한다(예: 응시 화면과 복기 화면). */
  storageKey: string;
  /** true면 왼쪽(설명) 패널과 손잡이를 숨기고 오른쪽만 전체 폭으로 보여준다
   *  (QuizTaking의 "문제 숨기기" 토글용). */
  leftHidden?: boolean;
  className?: string;
}

/**
 * 문제 설명(왼쪽)과 코드 에디터+실행결과(오른쪽)를 나누는 화면(QuizTaking.tsx,
 * ResultView.tsx)이 공유하는 분할 레이아웃. 기본은 5:5며, 가운데 손잡이를
 * 드래그(또는 포커스 후 방향키)하면 20~80% 범위 안에서 비율을 조정할 수 있다.
 * 좁은 화면(모바일 폭)에서는 CSS 미디어 쿼리가 항상 1열로 강제하므로(student.css)
 * 이 컴포넌트는 별도로 화면 폭을 신경 쓰지 않는다.
 */
export function SplitPanel({ left, right, storageKey, leftHidden, className }: SplitPanelProps) {
  const [ratio, setRatio] = useState(() => loadRatio(storageKey));
  const containerRef = useRef<HTMLDivElement>(null);

  function persist(next: number) {
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // localStorage 접근 불가(사생활 보호 모드 등) — 이번 세션 동안만 기억된다.
    }
  }

  function ratioFromClientX(clientX: number): number {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return ratio;
    return clampRatio(((clientX - rect.left) / rect.width) * 100);
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    function onMove(moveEvent: PointerEvent) {
      setRatio(ratioFromClientX(moveEvent.clientX));
    }
    function onUp(upEvent: PointerEvent) {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setRatio((current) => {
        persist(current);
        return current;
      });
    }
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setRatio((current) => {
        const next = clampRatio(current - KEYBOARD_STEP);
        persist(next);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setRatio((current) => {
        const next = clampRatio(current + KEYBOARD_STEP);
        persist(next);
        return next;
      });
    }
  }

  if (leftHidden) {
    return (
      <div className={className} style={{ gridTemplateColumns: "1fr" }}>
        {right}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ gridTemplateColumns: `${ratio}fr 10px ${100 - ratio}fr` }}
    >
      <div className="split-panel-left">{left}</div>
      <div
        className="split-handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={MIN_RATIO}
        aria-valuemax={MAX_RATIO}
        aria-valuenow={Math.round(ratio)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      />
      <div className="split-panel-right">{right}</div>
    </div>
  );
}
