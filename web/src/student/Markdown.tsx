import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownProps {
  text: string;
}

/**
 * 문항 설명은 교사가 Markdown으로 작성한다(teacher/ProblemEditor.tsx "설명 (Markdown)").
 * marked로 HTML을 만든 뒤 DOMPurify로 살균해 dangerouslySetInnerHTML에 넘긴다 — 학생 화면에
 * 그리는 값이라 XSS 방지가 필수다.
 */
export function Markdown({ text }: MarkdownProps) {
  const html = useMemo(() => {
    const rawHtml = marked.parse(text, { async: false, breaks: true }) as string;
    return DOMPurify.sanitize(rawHtml);
  }, [text]);

  return <div className="problem-description-panel" dangerouslySetInnerHTML={{ __html: html }} />;
}
