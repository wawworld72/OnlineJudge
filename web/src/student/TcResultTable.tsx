import type { TestCaseResult } from "./api";

interface TcResultTableProps {
  tcResults: TestCaseResult[];
}

/**
 * 연습 실행(QuizTaking)과 최종 채점 결과(ResultView)가 같은 `TestCaseResult` 모양을 쓰므로
 * 표를 공유한다. 비공개 테스트케이스는 입력/기대출력/실제출력을 서버가 아예 보내지 않으므로
 * (functions/src/services/graderClient.ts) "비공개"로만 표시한다.
 */
export function TcResultTable({ tcResults }: TcResultTableProps) {
  if (tcResults.length === 0) {
    return <div className="result-box muted">실행 결과가 없습니다.</div>;
  }

  return (
    <div className="result-box">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>공개</th>
            <th>결과</th>
            <th>입력</th>
            <th>기대 출력</th>
            <th>실제 출력</th>
          </tr>
        </thead>
        <tbody>
          {tcResults.map((tc, index) => (
            <tr key={tc.tcId}>
              <td>{index + 1}</td>
              <td>
                {tc.isPublic ? (
                  <span className="tc-public">공개</span>
                ) : (
                  <span className="tc-private">비공개</span>
                )}
              </td>
              <td>{tc.passed ? "통과" : "실패"}</td>
              <td className="tc-io">{tc.isPublic ? tc.input : <span className="muted">비공개</span>}</td>
              <td className="tc-io">
                {tc.isPublic ? tc.expectedOutput : <span className="muted">비공개</span>}
              </td>
              <td className="tc-io">
                {tc.isPublic ? tc.actualOutput : <span className="muted">비공개</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
