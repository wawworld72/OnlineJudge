import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { cpp } from "@codemirror/lang-cpp";
import { indentWithTab } from "@codemirror/commands";

interface CEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /** 켜면 에디터에서 붙여넣기·끌어다놓기·복사·잘라내기를 모두 막는다(부정행위
   *  방지 — 특히 문제/코드를 외부 AI 도구에 붙여넣는 경로 차단). 브라우저 DOM
   *  이벤트만 가로막는 억제책이라 완전한 차단은 아니다. */
  restrictClipboard?: boolean;
}

const BLOCKED_MESSAGE_MS = 2500;

export function CEditor({
  value,
  onChange,
  readOnly = false,
  restrictClipboard = false,
}: CEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const blockedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [blockedMessage, setBlockedMessage] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    return () => {
      clearTimeout(blockedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    function blockIfRestricted(event: Event): boolean {
      if (!restrictClipboard) return false;
      event.preventDefault();
      setBlockedMessage(true);
      clearTimeout(blockedTimeoutRef.current);
      blockedTimeoutRef.current = setTimeout(() => setBlockedMessage(false), BLOCKED_MESSAGE_MS);
      return true;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        cpp(),
        keymap.of([indentWithTab]),
        EditorView.editable.of(!readOnly),
        EditorView.domEventHandlers({
          paste: blockIfRestricted,
          copy: blockIfRestricted,
          cut: blockIfRestricted,
          drop: blockIfRestricted,
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, restrictClipboard]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} data-testid="c-editor" />
      {blockedMessage && (
        <div className="clipboard-blocked-banner">이 문제는 복사·붙여넣기가 제한되어 있습니다.</div>
      )}
    </div>
  );
}
