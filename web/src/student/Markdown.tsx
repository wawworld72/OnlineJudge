import { useMemo } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownProps {
  text: string;
}

/**
 * 코딩 문제 설명에는 "1~10", "1~~10"처럼 물결표(~)로 숫자 범위를 표기하는 경우가
 * 흔한데, GFM 취소선 문법(~~text~~)과 글자 그대로 충돌해 두 범위 표기 사이의
 * 내용이 통째로 취소선(<del>)으로 렌더링되는 문제가 있었다. 문제 설명에서 취소선을
 * 실제로 쓸 일은 없으므로, 취소선 토크나이저만 꺼서(나머지 Markdown 문법은 그대로
 * 지원) 물결표가 항상 순수 텍스트로 보이게 한다.
 */
const markdown = new Marked({ breaks: true }).use({
  tokenizer: {
    del() {
      return undefined;
    },
  },
});

/**
 * 문항 설명은 교사가 Markdown으로 작성한다(teacher/ProblemEditor.tsx "설명 (Markdown)").
 * marked로 HTML을 만든 뒤 DOMPurify로 살균해 dangerouslySetInnerHTML에 넘긴다 — 학생 화면에
 * 그리는 값이라 XSS 방지가 필수다.
 */
export function Markdown({ text }: MarkdownProps) {
  const html = useMemo(() => {
    const rawHtml = markdown.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml);
  }, [text]);

  return <div className="problem-description-panel" dangerouslySetInnerHTML={{ __html: html }} />;
}
