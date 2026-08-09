import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import {
  deleteProblem,
  deleteTestCase,
  upsertProblem,
  upsertTestCase,
  type ProblemDetail,
  type TestCaseDetail,
} from "./api";

interface ProblemEditorProps {
  quizId: string;
  problems: ProblemDetail[];
  onChanged: () => void;
}

const EMPTY_TEST_CASE: Omit<TestCaseDetail, "tcId"> = {
  tcNo: 1,
  input: "",
  expected: "",
  points: 0,
  isPublic: false,
  description: "",
};

/**
 * 문항·테스트케이스 편집 화면(FR-004~006). 배점 합계(`pointsTotal`)는 서버가 테스트케이스
 * 변경 시마다 재계산한 값을 그대로 표시할 뿐, 여기서 직접 계산하지 않는다(data-model.md
 * "pointsTotal/updatedAt의 소유권"). 삭제된 문항은 `getQuizForEdit`이 이미 제외하고
 * 반환하므로 이 화면에는 나타나지 않는다.
 */
export function ProblemEditor({ quizId, problems, onChanged }: ProblemEditorProps) {
  const [newProblem, setNewProblem] = useState({
    title: "",
    description: "",
    initialCode: "",
    maxRuns: "" as string | number,
  });

  async function addProblem() {
    await upsertProblem({
      quizId,
      order: problems.length,
      title: newProblem.title,
      description: newProblem.description,
      initialCode: newProblem.initialCode,
      maxRuns: newProblem.maxRuns === "" ? null : Number(newProblem.maxRuns),
    });
    setNewProblem({ title: "", description: "", initialCode: "", maxRuns: "" });
    onChanged();
  }

  return (
    <div>
      <h3>문항</h3>
      {problems.map((problem) => (
        <ProblemPanel key={problem.problemId} quizId={quizId} problem={problem} onChanged={onChanged} />
      ))}

      <h4>새 문항 추가</h4>
      <label>
        제목
        <input
          value={newProblem.title}
          onChange={(e) => setNewProblem({ ...newProblem, title: e.target.value })}
        />
      </label>
      <label>
        설명 (Markdown)
        <textarea
          value={newProblem.description}
          onChange={(e) => setNewProblem({ ...newProblem, description: e.target.value })}
        />
      </label>
      <label>
        초기 코드
        <textarea
          value={newProblem.initialCode}
          onChange={(e) => setNewProblem({ ...newProblem, initialCode: e.target.value })}
        />
      </label>
      <label>
        문항별 최대 실행 횟수 (비우면 퀴즈 기본값 사용)
        <input
          value={newProblem.maxRuns}
          onChange={(e) => setNewProblem({ ...newProblem, maxRuns: e.target.value })}
        />
      </label>
      <button onClick={addProblem}>문항 추가</button>
    </div>
  );
}

function ProblemPanel({
  quizId,
  problem,
  onChanged,
}: {
  quizId: string;
  problem: ProblemDetail;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(problem.title);
  const [description, setDescription] = useState(problem.description);
  const [initialCode, setInitialCode] = useState(problem.initialCode);
  const [newTestCase, setNewTestCase] = useState(EMPTY_TEST_CASE);

  async function saveMetadata() {
    await upsertProblem({
      quizId,
      problemId: problem.problemId,
      order: problem.order,
      title,
      description,
      initialCode,
      maxRuns: problem.maxRuns,
    });
    setEditing(false);
    onChanged();
  }

  async function removeProblem() {
    await deleteProblem({ quizId, problemId: problem.problemId });
    onChanged();
  }

  async function addTestCase() {
    await upsertTestCase({
      quizId,
      problemId: problem.problemId,
      testCase: { ...newTestCase, tcNo: problem.testCases.length + 1 },
    });
    setNewTestCase(EMPTY_TEST_CASE);
    onChanged();
  }

  return (
    <div>
      <h4>
        {problem.title} (배점 합계: {problem.pointsTotal})
      </h4>

      {editing ? (
        <div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          <textarea value={initialCode} onChange={(e) => setInitialCode(e.target.value)} />
          <button onClick={saveMetadata}>저장</button>
          <button onClick={() => setEditing(false)}>취소</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}>문항 정보 수정</button>
      )}

      <DelayedActionButton
        label="문항 삭제"
        pendingLabel="삭제 중..."
        delayedLabel="삭제에 시간이 걸리고 있습니다..."
        onAction={removeProblem}
      />

      <h5>테스트케이스</h5>
      <ul>
        {problem.testCases.map((tc) => (
          <TestCaseRow
            key={tc.tcId}
            quizId={quizId}
            problemId={problem.problemId}
            testCase={tc}
            onChanged={onChanged}
          />
        ))}
      </ul>

      <h5>테스트케이스 추가</h5>
      <label>
        입력값
        <textarea
          value={newTestCase.input}
          onChange={(e) => setNewTestCase({ ...newTestCase, input: e.target.value })}
        />
      </label>
      <label>
        기대 출력값
        <textarea
          value={newTestCase.expected}
          onChange={(e) => setNewTestCase({ ...newTestCase, expected: e.target.value })}
        />
      </label>
      <label>
        배점
        <input
          type="number"
          value={newTestCase.points}
          onChange={(e) => setNewTestCase({ ...newTestCase, points: Number(e.target.value) })}
        />
      </label>
      <label>
        공개 여부
        <input
          type="checkbox"
          checked={newTestCase.isPublic}
          onChange={(e) => setNewTestCase({ ...newTestCase, isPublic: e.target.checked })}
        />
      </label>
      <button onClick={addTestCase}>테스트케이스 추가</button>
    </div>
  );
}

function TestCaseRow({
  quizId,
  problemId,
  testCase,
  onChanged,
}: {
  quizId: string;
  problemId: string;
  testCase: TestCaseDetail;
  onChanged: () => void;
}) {
  async function removeTestCase() {
    await deleteTestCase({ quizId, problemId, tcId: testCase.tcId });
    onChanged();
  }

  return (
    <li>
      #{testCase.tcNo} {testCase.isPublic ? "(공개)" : "(비공개)"} - {testCase.points}점
      <button onClick={removeTestCase}>삭제</button>
    </li>
  );
}
