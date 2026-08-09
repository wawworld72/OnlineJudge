import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../shared/firestoreClient";

interface QuizListItem {
  quizId: string;
  title: string;
  description: string;
}

/**
 * 응시 가능한(OPEN) 퀴즈 목록. `quizzes`는 firestore.rules가 `status == 'OPEN'`인 문서의
 * 클라이언트 직접 read를 허용하는 예외이므로 Callable Function 없이 조회한다(contracts/
 * firestore-access-summary.md). 퀴즈ID를 아는 학생은 `/quiz/:quizId`로 바로 진입할 수도
 * 있다(딥링크).
 */
export function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);

  useEffect(() => {
    const q = query(collection(db, "quizzes"), where("status", "==", "OPEN"));
    getDocs(q).then((snapshot) => {
      setQuizzes(
        snapshot.docs.map((doc) => ({
          quizId: doc.id,
          title: doc.data().title,
          description: doc.data().description,
        })),
      );
    });
  }, []);

  if (quizzes === null) return <p>불러오는 중...</p>;
  if (quizzes.length === 0) return <p>지금 응시할 수 있는 퀴즈가 없습니다.</p>;

  return (
    <ul>
      {quizzes.map((quiz) => (
        <li key={quiz.quizId}>
          <Link to={`/quiz/${quiz.quizId}`}>{quiz.title}</Link>
          <p>{quiz.description}</p>
        </li>
      ))}
    </ul>
  );
}
