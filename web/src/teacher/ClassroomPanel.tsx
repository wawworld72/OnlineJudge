import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import {
  addTestRosterEntry,
  deployClassroomAssignment,
  pushGrades,
  resetClassroomDeployment,
  syncRoster,
  type PushGradesResponse,
  type SyncRosterResponse,
} from "./api";

interface ClassroomPanelProps {
  quizId: string;
  courseId: string;
  courseWorkId: string | null;
  startAt: number;
  onChanged: () => void;
}

/**
 * Classroom 연동 패널(FR-026~031, User Story 5 — 필수 기능). 수강생 동기화/과제 배포/
 * 성적 반영을 각각 실행하고 결과를 요약해 보여준다.
 */
export function ClassroomPanel({
  quizId,
  courseId,
  courseWorkId,
  startAt,
  onChanged,
}: ClassroomPanelProps) {
  const [now] = useState(() => Date.now());
  const [syncResult, setSyncResult] = useState<SyncRosterResponse | null>(null);
  const [pushResult, setPushResult] = useState<PushGradesResponse | null>(null);
  const [testStudentId, setTestStudentId] = useState("");
  const [testName, setTestName] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testAdded, setTestAdded] = useState(false);

  async function runSyncRoster() {
    const response = await syncRoster({ courseId });
    setSyncResult(response);
  }

  async function runAddTestRosterEntry() {
    await addTestRosterEntry({
      courseId,
      studentId: testStudentId,
      name: testName,
      email: testEmail,
    });
    setTestAdded(true);
  }

  async function runDeploy() {
    await deployClassroomAssignment({ quizId });
    onChanged();
  }

  async function runResetDeployment() {
    await resetClassroomDeployment({ quizId });
    onChanged();
  }

  async function runPushGrades() {
    const response = await pushGrades({ quizId });
    setPushResult(response);
  }

  return (
    <div>
      <h3>Classroom 연동</h3>

      <section>
        <h4>수강생 동기화</h4>
        <DelayedActionButton
          label="수강생 동기화"
          pendingLabel="동기화 중..."
          delayedLabel="동기화에 시간이 걸리고 있습니다..."
          onAction={runSyncRoster}
        />
        {syncResult && (
          <p>
            신규 {syncResult.newStudents} / 이메일 갱신 {syncResult.updatedEmails} / 신규 명부{" "}
            {syncResult.newRosterEntries} / 명부 갱신 {syncResult.updatedRosterEntries} / 명부 제외{" "}
            {syncResult.removedRosterEntries} / 건너뜀 {syncResult.skipped}
          </p>
        )}
      </section>

      <section>
        <h4>테스트용 수강생 추가(임시)</h4>
        <p className="field-hint">
          실제 Classroom 계정 없이 학생 화면(입장·문제 실행·제출)을 테스트하고 싶을 때, 본인이
          로그인할 이메일을 이 강의 명부에 임시로 추가합니다. 이 항목은 퀴즈 상태(DRAFT/OPEN/
          CLOSED)나 시작·종료 시각과 무관하게 언제든 입장·실행·제출까지 가능하고, 그 결과는 참가자
          현황·성적 반영·시트 내보내기에서 자동으로 제외됩니다. 다음에 "수강생 동기화"를 실제로
          실행하면 명부 항목은 자동으로 정리됩니다 — 단, 학번은 실제 학생과 겹치지 않을 만한 값(예:
          "test-teacher")을 입력해주세요.
        </p>
        <label>
          학번(실제 학생과 겹치지 않는 임의 값)
          <input value={testStudentId} onChange={(e) => setTestStudentId(e.target.value)} />
        </label>
        <label>
          이름
          <input value={testName} onChange={(e) => setTestName(e.target.value)} />
        </label>
        <label>
          로그인할 이메일
          <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
        </label>
        <DelayedActionButton
          label="테스트용 수강생 추가"
          pendingLabel="추가 중..."
          delayedLabel="추가에 시간이 걸리고 있습니다..."
          onAction={runAddTestRosterEntry}
        />
        {testAdded && <p>추가됨 — 다음 실제 수강생 동기화 시 자동으로 정리됩니다.</p>}
      </section>

      <section>
        <h4>과제 배포</h4>
        {courseWorkId ? (
          <>
            <p>
              {startAt > now
                ? `예약됨 (courseWorkId: ${courseWorkId}) — ${new Date(startAt).toLocaleString()}에 자동으로 게시됩니다.`
                : `배포됨 (courseWorkId: ${courseWorkId})`}
            </p>
            <DelayedActionButton
              label="배포 초기화"
              pendingLabel="초기화 중..."
              delayedLabel="초기화에 시간이 걸리고 있습니다..."
              onAction={runResetDeployment}
            />
          </>
        ) : (
          <DelayedActionButton
            label="Classroom에 과제 배포"
            pendingLabel="배포 중..."
            delayedLabel="배포에 시간이 걸리고 있습니다..."
            onAction={runDeploy}
          />
        )}
      </section>

      <section>
        <h4>성적 반영</h4>
        <DelayedActionButton
          label="성적 반영"
          pendingLabel="반영 중..."
          delayedLabel="반영에 시간이 걸리고 있습니다..."
          onAction={runPushGrades}
        />
        {pushResult && (
          <p>
            성공 {pushResult.succeeded} / 실패 {pushResult.failed}
            {pushResult.failed > 0 && ` (${pushResult.failedStudentIds.join(", ")})`}
          </p>
        )}
      </section>
    </div>
  );
}
