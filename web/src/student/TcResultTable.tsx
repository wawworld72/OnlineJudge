import type { TestCaseResult } from "./api";

interface TcResultTableProps {
  tcResults: TestCaseResult[];
}

/**
 * 연습 실행(QuizTaking)과 최종 채점 결과(ResultView)가 같은 `TestCaseResult` 모양을 쓰므로
 * 표를 공유한다. 비공개 테스트케이스는 입력/기대출력/실제출력/메모를 서버가 아예 보내지
 * 않으므로(functions/src/services/graderClient.ts) 기본적으로 "비공개"로만 표시한다.
 * 배점은 정답 자체가 아니므로 공개 여부와 무관하게 항상 보여준다.
 *
 * 각 칸은 `tc.isPublic`이 아니라 **필드가 실제로 왔는지**로 분기한다 — 퀴즈가
 * 종료된 뒤 교사가 공개를 켜면(getMyResult.ts) 원래 비공개였던 항목도 입력/기대
 * 출력만 되살아나 온다(실제 출력은 채점 시점에 저장되지 않아 여전히 없음). "공개"
 * 배지는 그대로 "이 문항이 원래 비공개로 설정돼 있었는지"를 보여줄 뿐이라, 공개된
 * 뒤에도 배지는 "비공개"인데 입력/기대출력 칸에는 값이 보이는 조합이 정상이다.
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
            <th>TC</th>
            <th>공개</th>
            <th>결과</th>
            <th>배점</th>
            <th>입력</th>
            <th>기대 출력</th>
            <th>실제 출력</th>
            <th>메모</th>
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
              <td>{tc.passed ? "✅ PASS" : "❌ FAIL"}</td>
              <td>{tc.points}</td>
              <td className="tc-io">{tc.input ?? <span className="muted">비공개</span>}</td>
              <td className="tc-io">
                {tc.expectedOutput ?? <span className="muted">비공개</span>}
              </td>
              <td className="tc-io">{tc.actualOutput ?? <span className="muted">비공개</span>}</td>
              <td className="tc-io">{tc.memo ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
