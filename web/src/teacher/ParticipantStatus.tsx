import { useEffect, useState } from "react";
import {
  getParticipantDetail,
  getParticipantOverview,
  type ParticipantDetail,
  type ParticipantOverviewItem,
} from "./api";

interface ParticipantStatusProps {
  quizId: string;
}

const STATUS_LABEL: Record<ParticipantOverviewItem["status"], string> = {
  NOT_ENTERED: "미입장",
  IN_PROGRESS: "응시중",
  SUBMITTED: "제출완료",
  FINALIZED: "채점완료",
};

/** 참가자 현황 목록 + 상세 열람 화면(FR-025). */
export function ParticipantStatus({ quizId }: ParticipantStatusProps) {
  const [participants, setParticipants] = useState<ParticipantOverviewItem[] | null>(null);
  const [detail, setDetail] = useState<{ studentId: string; data: ParticipantDetail } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getParticipantOverview({ quizId }).then((response) => setParticipants(response.participants));
  }, [quizId]);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await getParticipantOverview({ quizId });
      setParticipants(response.participants);
    } finally {
      setRefreshing(false);
    }
  }

  async function openDetail(studentId: string) {
    const data = await getParticipantDetail({ quizId, studentId });
    setDetail({ studentId, data });
  }

  if (participants === null) return <p>불러오는 중...</p>;

  return (
    <div>
      <h3>
        참가자 현황
        <button className="secondary" onClick={refresh} disabled={refreshing} style={{ marginLeft: 12 }}>
          {refreshing ? "새로고침 중..." : "새로고침"}
        </button>
      </h3>
      <table>
        <thead>
          <tr>
            <th>학번</th>
            <th>이름</th>
            <th>상태</th>
            <th>제출 시각</th>
            <th>확정 점수</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.studentId}>
              <td>{p.studentId}</td>
              <td>{p.name}</td>
              <td>{STATUS_LABEL[p.status]}</td>
              <td>{p.submittedAt ? new Date(p.submittedAt).toLocaleString() : "-"}</td>
              <td>{p.finalTotal ?? "-"}</td>
              <td>
                {p.status !== "NOT_ENTERED" && (
                  <button onClick={() => openDetail(p.studentId)}>상세</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-box">
            <h4>{detail.studentId} 상세</h4>
            {Object.entries(detail.data.runResults).map(([problemId, result]) => (
              <div key={problemId} style={{ marginBottom: 12 }}>
                <p>
                  {problemId}: {result.status} ({result.score} / {result.maxScore})
                </p>
                <pre className="result-box">{detail.data.submissions[problemId]?.code}</pre>
              </div>
            ))}
            <div className="modal-actions">
              <button onClick={() => setDetail(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
