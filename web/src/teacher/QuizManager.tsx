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
import { ClassroomPanel } from "./ClassroomPanel";
import { ArchiveDelete } from "./ArchiveDelete";
import "./teacher.css";

const NEXT_STATUS: Record<QuizStatus, QuizStatus | null> = {
  DRAFT: "OPEN",
  OPEN: "CLOSED",
  CLOSED: null,
};

type TabKey = "problems" | "deploy" | "participants" | "classroom" | "archive";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "problems", label: "문항 관리" },
  { key: "deploy", label: "배포 · 채점" },
  { key: "participants", label: "참가자 현황" },
  { key: "classroom", label: "Classroom 연동" },
  { key: "archive", label: "아카이브 · 삭제" },
];

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
  const [activeTab, setActiveTab] = useState<TabKey>("problems");

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
    setActiveTab("problems");
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
      <div className="container">
        <div className="card">
          <h1>퀴즈 관리</h1>
          <button onClick={openForCreate}>새 퀴즈 만들기</button>
        </div>

        <div className="card">
          {quizzes === null ? (
            <p className="muted">불러오는 중...</p>
          ) : quizzes.length === 0 ? (
            <p className="muted">아직 만든 퀴즈가 없습니다.</p>
          ) : (
            quizzes.map((quiz) => (
              <button
                key={quiz.quizId}
                className="quiz-list-item"
                onClick={() => openForEdit(quiz.quizId)}
              >
                {quiz.title}
                <span className={`status-badge ${quiz.status}`}>{quiz.status}</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <button className="secondary" onClick={() => setShowForm(false)}>
          ← 목록으로
        </button>
        <h2>
          {selected ? selected.title : "퀴즈 생성"}
          {selected && <span className={`status-badge ${selected.status}`}>{selected.status}</span>}
        </h2>

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
        <label>
          Classroom 강의 ID (courseId)
          <input
            value={form.courseId ?? ""}
            placeholder="비워두면 Classroom 연동 없이 진행"
            onChange={(e) => setForm({ ...form, courseId: e.target.value.trim() || null })}
          />
          <p className="field-hint">
            classroom.google.com/c/<b>강의ID</b> 형태의 강의 URL에서 강의ID 부분을 붙여넣으세요.
          </p>
        </label>

        <DelayedActionButton
          label="저장"
          pendingLabel="저장 중..."
          delayedLabel="저장에 시간이 걸리고 있습니다..."
          onAction={saveQuiz}
        />

        {selected && NEXT_STATUS[selected.status] && (
          <DelayedActionButton
            label={`${NEXT_STATUS[selected.status]}로 전환`}
            pendingLabel="전환 중..."
            delayedLabel="전환에 시간이 걸리고 있습니다..."
            onAction={advanceStatus}
          />
        )}
      </div>

      {selected && (
        <>
          <div className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`tab-btn ${activeTab === tab.key ? "active" : ""}`.trim()}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="card tab-panel">
            {activeTab === "problems" && (
              <ProblemEditor
                quizId={selected.quizId}
                problems={selected.problems}
                onChanged={() => openForEdit(selected.quizId)}
              />
            )}

            {activeTab === "deploy" && (
              <>
                <h3>배포 전 점검</h3>
                <PreDeployCheck quizId={selected.quizId} />
                <h3>일괄 채점</h3>
                <BatchGrade quizId={selected.quizId} />
              </>
            )}

            {activeTab === "participants" && <ParticipantStatus quizId={selected.quizId} />}

            {activeTab === "classroom" &&
              (selected.courseId ? (
                <ClassroomPanel
                  quizId={selected.quizId}
                  courseId={selected.courseId}
                  courseWorkId={selected.courseWorkId}
                  onChanged={() => openForEdit(selected.quizId)}
                />
              ) : (
                <p className="muted">
                  먼저 위 기본정보에서 "Classroom 강의 ID"를 입력하고 저장하면 연동 기능이
                  나타납니다.
                </p>
              ))}

            {activeTab === "archive" && (
              <ArchiveDelete
                quizId={selected.quizId}
                archivedAt={selected.archivedAt}
                archiveSpreadsheetUrl={selected.archiveSpreadsheetUrl}
                onArchived={() => openForEdit(selected.quizId)}
                onDeleted={() => {
                  setShowForm(false);
                  refreshList();
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
