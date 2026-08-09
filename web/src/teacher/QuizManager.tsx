import { useEffect, useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import {
  getQuizForEdit,
  listQuizzes,
  setQuizStatus,
  upsertQuiz,
  type QuizDetail,
  type QuizListItem,
  type QuizStatus,
  type UpsertQuizInput,
} from "./api";
import { ProblemEditor } from "./ProblemEditor";
import { PreDeployCheck } from "./PreDeployCheck";
import { BatchGrade } from "./BatchGrade";
import { ParticipantStatus } from "./ParticipantStatus";

const NEXT_STATUS: Record<QuizStatus, QuizStatus | null> = {
  DRAFT: "OPEN",
  OPEN: "CLOSED",
  CLOSED: null,
};

function toFormFields(quiz?: QuizDetail): UpsertQuizInput {
  return {
    quizId: quiz?.quizId,
    title: quiz?.title ?? "",
    description: quiz?.description ?? "",
    startAt: quiz?.startAt ?? Date.now(),
    endAt: quiz?.endAt ?? Date.now() + 60 * 60 * 1000,
    accessCode: quiz?.accessCode ?? "",
    maxRunsPerProblem: quiz?.maxRunsPerProblem ?? 5,
    courseId: quiz?.courseId ?? null,
  };
}

/** 교사 퀴즈 목록/생성/수정/상태전환 화면(FR-003, FR-008). */
export function QuizManager() {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [selected, setSelected] = useState<QuizDetail | null>(null);
  const [form, setForm] = useState<UpsertQuizInput>(toFormFields());
  const [showForm, setShowForm] = useState(false);

  async function refreshList() {
    const response = await listQuizzes();
    setQuizzes(response.quizzes);
  }

  useEffect(() => {
    listQuizzes().then((response) => setQuizzes(response.quizzes));
  }, []);

  async function openForCreate() {
    setSelected(null);
    setForm(toFormFields());
    setShowForm(true);
  }

  async function openForEdit(quizId: string) {
    const quiz = await getQuizForEdit({ quizId });
    setSelected(quiz);
    setForm(toFormFields(quiz));
    setShowForm(true);
  }

  async function saveQuiz() {
    const response = await upsertQuiz(form);
    await refreshList();
    const quiz = await getQuizForEdit({ quizId: response.quizId });
    setSelected(quiz);
    setForm(toFormFields(quiz));
  }

  async function advanceStatus() {
    if (!selected) return;
    const next = NEXT_STATUS[selected.status];
    if (!next) return;
    await setQuizStatus({ quizId: selected.quizId, status: next });
    const quiz = await getQuizForEdit({ quizId: selected.quizId });
    setSelected(quiz);
    await refreshList();
  }

  if (!showForm) {
    return (
      <div>
        <h1>퀴즈 관리</h1>
        <button onClick={openForCreate}>새 퀴즈 만들기</button>
        {quizzes === null ? (
          <p>불러오는 중...</p>
        ) : (
          <ul>
            {quizzes.map((quiz) => (
              <li key={quiz.quizId}>
                <button onClick={() => openForEdit(quiz.quizId)}>
                  [{quiz.status}] {quiz.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setShowForm(false)}>목록으로</button>
      <h2>{selected ? "퀴즈 수정" : "퀴즈 생성"}</h2>

      <label>
        제목
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label>
        설명
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label>
        출입코드
        <input
          value={form.accessCode}
          onChange={(e) => setForm({ ...form, accessCode: e.target.value })}
        />
      </label>
      <label>
        문항당 기본 최대 실행 횟수
        <input
          type="number"
          value={form.maxRunsPerProblem}
          onChange={(e) => setForm({ ...form, maxRunsPerProblem: Number(e.target.value) })}
        />
      </label>
      <label>
        시작 시각
        <input
          type="datetime-local"
          value={new Date(form.startAt).toISOString().slice(0, 16)}
          onChange={(e) => setForm({ ...form, startAt: new Date(e.target.value).getTime() })}
        />
      </label>
      <label>
        종료 시각
        <input
          type="datetime-local"
          value={new Date(form.endAt).toISOString().slice(0, 16)}
          onChange={(e) => setForm({ ...form, endAt: new Date(e.target.value).getTime() })}
        />
      </label>

      <DelayedActionButton
        label="저장"
        pendingLabel="저장 중..."
        delayedLabel="저장에 시간이 걸리고 있습니다..."
        onAction={saveQuiz}
      />

      {selected && (
        <>
          <p>현재 상태: {selected.status}</p>
          {NEXT_STATUS[selected.status] && (
            <DelayedActionButton
              label={`${NEXT_STATUS[selected.status]}로 전환`}
              pendingLabel="전환 중..."
              delayedLabel="전환에 시간이 걸리고 있습니다..."
              onAction={advanceStatus}
            />
          )}

          <PreDeployCheck quizId={selected.quizId} />
          <BatchGrade quizId={selected.quizId} />
          <ParticipantStatus quizId={selected.quizId} />
          <ProblemEditor
            quizId={selected.quizId}
            problems={selected.problems}
            onChanged={() => openForEdit(selected.quizId)}
          />
        </>
      )}
    </div>
  );
}
