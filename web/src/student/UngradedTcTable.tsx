import type { UngradedTestCase } from "./api";

interface UngradedTcTableProps {
  testCases: UngradedTestCase[];
}

/**
 * 최종 제출 직후 채점 전에 보여주는 테스트케이스 표. 채점 결과가 없으므로 정답 여부 없이
 * 원래 공개/비공개 여부, 배점, 입력, 기대 출력만 보여준다 — 비공개 항목도 입력·기대 출력을
 * 그대로 공개한다(교사가 퀴즈별로 끌 수 있음, 끄면 서버가 이 데이터를 아예 보내지 않는다).
 */
export function UngradedTcTable({ testCases }: UngradedTcTableProps) {
  if (testCases.length === 0) return null;

  return (
    <div className="result-box">
      <table>
        <thead>
          <tr>
            <th>TC</th>
            <th>공개</th>
            <th>배점</th>
            <th>입력</th>
            <th>기대 출력</th>
          </tr>
        </thead>
        <tbody>
          {testCases.map((tc, index) => (
            <tr key={tc.tcId}>
              <td>{index + 1}</td>
              <td>
                {tc.isPublic ? (
                  <span className="tc-public">공개</span>
                ) : (
                  <span className="tc-private">비공개</span>
                )}
              </td>
              <td>{tc.points}</td>
              <td className="tc-io">{tc.input}</td>
              <td className="tc-io">{tc.expectedOutput}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
