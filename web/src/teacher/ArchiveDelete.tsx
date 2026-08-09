import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { archiveQuiz, deleteQuizData } from "./api";

interface ArchiveDeleteProps {
  quizId: string;
  archivedAt: number | null;
  archiveSpreadsheetUrl: string | null;
  onArchived: () => void;
  onDeleted: () => void;
}

/**
 * 아카이브/삭제 버튼과 미아카이브 경고 확인 다이얼로그(FR-037~040). 삭제는 되돌릴 수
 * 없으므로 아카이브 여부와 무관하게 항상 확인을 거친다 — 아카이브가 없으면 경고 문구가
 * 추가된다.
 */
export function ArchiveDelete({
  quizId,
  archivedAt,
  archiveSpreadsheetUrl,
  onArchived,
  onDeleted,
}: ArchiveDeleteProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function runArchive() {
    await archiveQuiz({ quizId });
    onArchived();
  }

  async function confirmDelete() {
    await deleteQuizData({ quizId, confirmWithoutArchive: archivedAt === null });
    setConfirmingDelete(false);
    onDeleted();
  }

  return (
    <div>
      <h3>아카이브 / 삭제</h3>

      <DelayedActionButton
        label="아카이브(스프레드시트로 내보내기)"
        pendingLabel="아카이브 중..."
        delayedLabel="아카이브에 시간이 걸리고 있습니다..."
        onAction={runArchive}
      />
      {archivedAt && archiveSpreadsheetUrl && (
        <p>
          아카이브됨:{" "}
          <a href={archiveSpreadsheetUrl} target="_blank" rel="noreferrer">
            스프레드시트 열기
          </a>
        </p>
      )}

      <button onClick={() => setConfirmingDelete(true)}>데이터 삭제</button>

      {confirmingDelete && (
        <div role="dialog" aria-modal="true">
          <p>삭제된 데이터는 복구할 수 없습니다.</p>
          {!archivedAt && <p role="alert">아직 아카이브하지 않았습니다. 그래도 삭제하시겠습니까?</p>}
          <button onClick={() => setConfirmingDelete(false)}>취소</button>
          <DelayedActionButton
            label="삭제 확정"
            pendingLabel="삭제 중..."
            delayedLabel="삭제에 시간이 걸리고 있습니다..."
            onAction={confirmDelete}
          />
        </div>
      )}
    </div>
  );
}
