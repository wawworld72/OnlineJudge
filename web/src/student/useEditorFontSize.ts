import { useCallback, useState } from "react";

const STORAGE_KEY = "cquiz_editorFontSize";
export const DEFAULT_EDITOR_FONT_SIZE = 16;
export const MIN_EDITOR_FONT_SIZE = 12;
export const MAX_EDITOR_FONT_SIZE = 28;

function clamp(size: number): number {
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)));
}

function readStoredSize(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : DEFAULT_EDITOR_FONT_SIZE;
  } catch {
    return DEFAULT_EDITOR_FONT_SIZE;
  }
}

/**
 * 코드 에디터 글자 크기(px). 모니터·해상도마다 읽기 편한 크기가 달라 학생이 직접 조절하며,
 * 같은 브라우저에서는 응시 화면과 복기 화면이 값을 공유하도록 localStorage에 저장한다.
 */
export function useEditorFontSize() {
  const [size, setSize] = useState(readStoredSize);

  const change = useCallback((next: number) => {
    const clamped = clamp(next);
    setSize(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // 저장 실패(사생활 보호 모드 등)해도 이번 화면에서는 그대로 동작한다.
    }
  }, []);

  return { size, setSize: change };
}
