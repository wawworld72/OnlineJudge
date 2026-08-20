import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import {
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
  onChanged: () => void;
}

/**
 * Classroom 연동 패널(FR-026~031, User Story 5 — 필수 기능). 수강생 동기화/과제 배포/
 * 성적 반영을 각각 실행하고 결과를 요약해 보여준다.
 */
export function ClassroomPanel({ quizId, courseId, courseWorkId, onChanged }: ClassroomPanelProps) {
  const [syncResult, setSyncResult] = useState<SyncRosterResponse | null>(null);
  const [pushResult, setPushResult] = useState<PushGradesResponse | null>(null);

  async function runSyncRoster() {
    const response = await syncRoster({ courseId });
    setSyncResult(response);
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
        <h4>과제 배포</h4>
        {courseWorkId ? (
          <>
            <p>배포됨 (courseWorkId: {courseWorkId})</p>
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
