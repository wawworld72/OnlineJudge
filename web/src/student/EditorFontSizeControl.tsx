import {
  DEFAULT_EDITOR_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
} from "./useEditorFontSize";

interface EditorFontSizeControlProps {
  size: number;
  onChange: (size: number) => void;
}

/** 코드 에디터 글자 크기 조절(작게/크게/기본). */
export function EditorFontSizeControl({ size, onChange }: EditorFontSizeControlProps) {
  return (
    <div className="editor-font-control" role="group" aria-label="코드 글자 크기">
      <span className="editor-font-label">글자 크기</span>
      <button
        type="button"
        className="secondary"
        onClick={() => onChange(size - 1)}
        disabled={size <= MIN_EDITOR_FONT_SIZE}
        aria-label="글자 작게"
      >
        A−
      </button>
      <span className="editor-font-size">{size}px</span>
      <button
        type="button"
        className="secondary"
        onClick={() => onChange(size + 1)}
        disabled={size >= MAX_EDITOR_FONT_SIZE}
        aria-label="글자 크게"
      >
        A+
      </button>
      <button
        type="button"
        className="secondary"
        onClick={() => onChange(DEFAULT_EDITOR_FONT_SIZE)}
        disabled={size === DEFAULT_EDITOR_FONT_SIZE}
      >
        기본
      </button>
    </div>
  );
}
