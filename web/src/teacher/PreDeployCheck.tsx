import { useState } from "react";
import { DelayedActionButton } from "../shared/DelayedActionButton";
import { runPreDeployCheck, type CheckItem } from "./api";

interface PreDeployCheckProps {
  quizId: string;
}

/**
 * 배포 전 점검 결과 패널(FR-007). Classroom 두 항목(`classroomRosterSync`/
 * `classroomDeployment`)은 서버가 항상 WARN 이하로만 판정하므로 여기서 별도 처리가
 * 필요 없다 — 그대로 표시한다.
 */
export function PreDeployCheck({ quizId }: PreDeployCheckProps) {
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [blockingCount, setBlockingCount] = useState(0);

  async function run() {
    const response = await runPreDeployCheck({ quizId });
    setItems(response.items);
    setBlockingCount(response.blockingCount);
  }

  return (
    <div>
      <DelayedActionButton
        label="배포 전 점검"
        pendingLabel="점검 중..."
        delayedLabel="점검에 시간이 걸리고 있습니다..."
        onAction={run}
      />

      {items && (
        <div>
          <p>{blockingCount > 0 ? `차단 항목 ${blockingCount}건` : "차단 항목 없음"}</p>
          <ul>
            {items.map((item) => (
              <li key={item.key}>
                [{item.level}] {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
