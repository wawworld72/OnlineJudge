import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "../shared/firestoreClient";

interface QuizListItem {
  quizId: string;
  title: string;
  description: string;
  endAt: number;
}

/**
 * 응시 가능한(OPEN) 퀴즈 목록. `quizzes`는 firestore.rules가 `status == 'OPEN'`인 문서의
 * 클라이언트 직접 read를 허용하는 예외이므로 Callable Function 없이 조회한다(contracts/
 * firestore-access-summary.md). 퀴즈ID를 아는 학생은 `/quiz/:quizId`로 바로 진입할 수도
 * 있다(딥링크).
 */
export function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  function loadQuizzes(): Promise<QuizListItem[]> {
    const q = query(collection(db, "quizzes"), where("status", "==", "OPEN"));
    return getDocs(q).then((snapshot) =>
      snapshot.docs.map((doc) => {
        const data = doc.data();
        const endAt = data.endAt as Timestamp;
        return {
          quizId: doc.id,
          title: data.title,
          description: data.description,
          endAt: endAt.toMillis(),
        };
      }),
    );
  }

  useEffect(() => {
    loadQuizzes().then(setQuizzes);
  }, []);

  function refresh() {
    setQuizzes(null);
    loadQuizzes().then(setQuizzes);
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="container">
      <div className="card">
        <h1>OJHG</h1>
        <p className="muted">퀴즈를 선택하세요.</p>
        <button className="secondary" onClick={refresh}>
          새로고침
        </button>
      </div>

      {quizzes === null ? (
        <div className="card">
          <p className="muted">불러오는 중...</p>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="card">
          <p className="muted">지금 응시할 수 있는 퀴즈가 없습니다.</p>
        </div>
      ) : (
        <div className="quiz-grid">
          {quizzes.map((quiz) => {
            const diffMs = quiz.endAt - now;
            const ending = diffMs < 10 * 60 * 1000;
            return (
              <Link
                key={quiz.quizId}
                to={`/quiz/${quiz.quizId}`}
                state={{ fromList: true }}
                className="quiz-card"
              >
                <h3>{quiz.title}</h3>
                {quiz.description && <div className="quiz-desc">{quiz.description}</div>}
                <span className={`quiz-remaining${ending ? " ending" : ""}`}>
                  남은 시간 {formatRemainingShort(Math.max(0, diffMs))}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRemainingShort(diffMs: number): string {
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
