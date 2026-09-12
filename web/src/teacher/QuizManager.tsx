import { useEffect, useState } from "react";
import { getAuth, signOut } from "firebase/auth";
import { firebaseApp } from "../shared/firebaseApp";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { getErrorCode } from "../shared/functionsClient";
import { formatRemaining } from "../shared/countdown";
import {
  endQuizTimer,
  getQuizForEdit,
  listQuizzes,
  pauseQuizTimer,
  setQuizStatus,
  setQuizTimerDuration,
  startQuizTimer,
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

function sortQuizzes(quizzes: QuizListItem[]): QuizListItem[] {
  return [...quizzes].sort(
    (a, b) =>
      (a.subjectName ?? "").localeCompare(b.subjectName ?? "") ||
      (a.title ?? "").localeCompare(b.title ?? "") ||
      a.startAt - b.startAt,
  );
}

/**
 * `<input type="datetime-local">`은 값을 항상 "로컬 시각"으로 해석·표시한다.
 * `toISOString()`은 항상 UTC라서 그대로 슬라이스하면 목록 화면(`toLocaleString()`,
 * 로컬 기준)과 다른 시각으로 보인다 — 시간대 오프셋만큼 어긋나는 버그. 로컬 기준
 * 벽시계 값을 UTC ISO 형식으로 얻기 위해 오프셋을 먼저 상쇄한다.
 */
function toDatetimeLocalValue(ms: number): string {
  const offsetMs = new Date(ms).getTimezoneOffset() * 60_000;
  return new Date(ms - offsetMs).toISOString().slice(0, 16);
}

function toFormFields(quiz?: QuizDetail): UpsertQuizInput {
  return {
    quizId: quiz?.quizId,
    subjectName: quiz?.subjectName ?? "",
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
  const [listError, setListError] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<QuizDetail | null>(null);
  const [form, setForm] = useState<UpsertQuizInput>(toFormFields());
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("problems");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 목록 화면의 "남은 시간" 표시가 매초 갱신되도록, 행마다 따로 타이머를 두지 않고
  // 이 하나의 시계를 모든 행이 함께 쓴다.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function refreshList() {
    setListError(null);
    try {
      const response = await listQuizzes();
      setQuizzes(sortQuizzes(response.quizzes));
    } catch (cause) {
      console.error("listQuizzes 실패", cause);
      const code = getErrorCode(cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      setListError(code ? `${message} (${code})` : message);
    }
  }

  useEffect(() => {
    listQuizzes()
      .then((response) => setQuizzes(sortQuizzes(response.quizzes)))
      .catch((cause: unknown) => {
        console.error("listQuizzes 실패", cause);
        const code = getErrorCode(cause);
        const message = cause instanceof Error ? cause.message : String(cause);
        setListError(code ? `${message} (${code})` : message);
      });
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

  /** 목록 화면의 타이머/마감 버튼들은 `DelayedActionButton` 없이 일반 버튼으로
   *  두되(표 셀 안에 들어가는 작은 버튼이라 카드 전용 컴포넌트는 과함), 실패해도
   *  `listError`(목록 자체를 못 불러온 경우)와 달리 표는 그대로 두고 별도
   *  배너로만 알린다 — 행 하나의 일시적 실패로 전체 목록이 사라지면 안 된다. */
  async function runRowAction(action: () => Promise<unknown>) {
    try {
      setRowActionError(null);
      await action();
      await refreshList();
    } catch (cause) {
      console.error("퀴즈 목록 행 동작 실패", cause);
      const code = getErrorCode(cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      setRowActionError(code ? `${message} (${code})` : message);
    }
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

  function timerDisplay(quiz: QuizListItem) {
    if (quiz.status === "CLOSED") {
      return <span className="muted">00:00:00</span>;
    }
    if (quiz.status === "DRAFT") {
      return (
        <span>
          <input
            type="number"
            min={1}
            defaultValue={Math.round(quiz.timerDurationMs / 60_000)}
            onBlur={(e) => {
              const minutes = Number(e.target.value);
              if (minutes > 0) {
                runRowAction(() =>
                  setQuizTimerDuration({ quizId: quiz.quizId, timerDurationMs: minutes * 60_000 }),
                );
              }
            }}
            style={{ width: "4rem" }}
          />{" "}
          분
        </span>
      );
    }
    const remainingMs = quiz.pausedAt
      ? Math.max(0, quiz.endAt - quiz.pausedAt)
      : Math.max(0, quiz.endAt - nowMs);
    return (
      <span className={quiz.pausedAt ? "muted" : ""}>
        {formatRemaining(remainingMs)}
        {quiz.pausedAt ? " (일시정지)" : ""}
      </span>
    );
  }

  function timerControls(quiz: QuizListItem) {
    if (quiz.status === "CLOSED") {
      return <span className="muted">종료됨</span>;
    }
    const running = quiz.status === "OPEN" && !quiz.pausedAt;
    return (
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button
          className="secondary"
          onClick={() =>
            runRowAction(() =>
              running
                ? pauseQuizTimer({ quizId: quiz.quizId })
                : startQuizTimer({ quizId: quiz.quizId }),
            )
          }
        >
          {running ? "멈춤" : "시작"}
        </button>
        <button
          className="secondary"
          disabled={quiz.status !== "OPEN"}
          onClick={() => runRowAction(() => endQuizTimer({ quizId: quiz.quizId }))}
        >
          종료
        </button>
        <button
          className="danger"
          disabled={quiz.status !== "OPEN"}
          onClick={() =>
            runRowAction(() => setQuizStatus({ quizId: quiz.quizId, status: "CLOSED" }))
          }
        >
          최종 제출 마감
        </button>
      </span>
    );
  }

  if (!showForm) {
    return (
      <div className="container">
        <div className="card">
          <h1>퀴즈 관리</h1>
          <button onClick={openForCreate}>새 퀴즈 만들기</button>
          <button className="secondary" onClick={() => signOut(getAuth(firebaseApp))}>
            로그아웃
          </button>
        </div>

        <div className="card">
          {rowActionError && (
            <p role="alert" className="error">
              {rowActionError}
            </p>
          )}
          {listError ? (
            <div>
              <p role="alert" className="error">
                목록을 불러오지 못했습니다: {listError}
              </p>
              <button className="secondary" onClick={refreshList}>
                다시 시도
              </button>
            </div>
          ) : quizzes === null ? (
            <p className="muted">불러오는 중...</p>
          ) : quizzes.length === 0 ? (
            <p className="muted">아직 만든 퀴즈가 없습니다.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>과목명</th>
                    <th>퀴즈명</th>
                    <th>시작시각</th>
                    <th>종료시각</th>
                    <th>상태</th>
                    <th>타이머</th>
                    <th>타이머 제어</th>
                    <th>출입코드</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {quizzes.map((quiz) => {
                    const url = `${window.location.origin}/quiz/${quiz.quizId}`;
                    return (
                      <tr key={quiz.quizId}>
                        <td>{quiz.subjectName}</td>
                        <td>
                          <button className="link-button" onClick={() => openForEdit(quiz.quizId)}>
                            {quiz.title}
                          </button>
                        </td>
                        <td>{new Date(quiz.startAt).toLocaleString()}</td>
                        <td>{new Date(quiz.endAt).toLocaleString()}</td>
                        <td>
                          <span className={`status-badge ${quiz.status}`}>{quiz.status}</span>
                        </td>
                        <td>{timerDisplay(quiz)}</td>
                        <td>{timerControls(quiz)}</td>
                        <td>{quiz.accessCode}</td>
                        <td>
                          <a href={url} target="_blank" rel="noreferrer">
                            {url}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
          과목명
          <input
            value={form.subjectName}
            onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
          />
          <p className="field-hint">
            같은 과목명을 쓰는 퀴즈들은 Apps Script 연동에서 한꺼번에 묶어 조회됩니다(예:
            "컴퓨터프로그래밍심화(01분반)").
          </p>
        </label>
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
            value={toDatetimeLocalValue(form.startAt)}
            onChange={(e) => setForm({ ...form, startAt: new Date(e.target.value).getTime() })}
          />
        </label>
        <label>
          종료 시각
          <input
            type="datetime-local"
            value={toDatetimeLocalValue(form.endAt)}
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
                  startAt={selected.startAt}
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
