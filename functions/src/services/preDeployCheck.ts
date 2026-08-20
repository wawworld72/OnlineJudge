import type { Firestore } from "firebase-admin/firestore";
import type { Problem, ProblemSecrets, Quiz } from "../models/types";

export type CheckLevel = "PASS" | "WARN" | "BLOCK";
export interface CheckItem {
  key: string;
  level: CheckLevel;
  message: string;
}

/**
 * FR-007. 데이터를 변경하지 않고 판정만 한다. `classroomDeployment`(Classroom 배포 여부)는
 * User Story 5가 필수임을 인지시키는 목적일 뿐, 급한 사정으로 Classroom 없이 진행해야
 * 하는 경우를 막지 않기 위해 WARN으로만 판정한다(FR-007, 절대 BLOCK 아님). 반면
 * `classroomRosterSync`는 예외다 — `courseId`가 있는 퀴즈는 `enterQuiz`가 학번/이름
 * 직접입력 같은 대체 경로 없이 명부(rosters)로만 학생을 확인하므로, 동기화가 안 되어
 * 있으면 학생이 아무도 입장할 수 없다. 그래서 이 항목만 BLOCK이다. `setQuizStatus`가
 * `OPEN` 전환을 막을지 판단할 때도 이 함수를 그대로 재사용해, 저장된 이전 점검 결과가
 * 최신 데이터와 어긋나는 문제를 피한다.
 */
export async function computePreDeployCheck(
  db: Firestore,
  quizId: string,
): Promise<{ items: CheckItem[]; blockingCount: number }> {
  const quizRef = db.collection("quizzes").doc(quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  const problemsSnap = await quizRef.collection("problems").where("deletedAt", "==", null).get();
  const problems = problemsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Problem) }));

  const items: CheckItem[] = [];

  items.push(
    problems.length > 0
      ? { key: "problemsExist", level: "PASS", message: `문항 ${problems.length}개` }
      : { key: "problemsExist", level: "BLOCK", message: "문항이 하나도 없습니다." },
  );

  const secretsSnaps = await Promise.all(
    problems.map((problem) => quizRef.collection("problemSecrets").doc(problem.id).get()),
  );
  const emptyTestCaseProblems = problems.filter((problem, index) => {
    const secrets = secretsSnaps[index]!.data() as ProblemSecrets | undefined;
    return !secrets || secrets.items.length === 0;
  });
  items.push(
    emptyTestCaseProblems.length === 0
      ? { key: "testCasesExist", level: "PASS", message: "모든 문항에 테스트케이스가 있습니다." }
      : {
          key: "testCasesExist",
          level: "BLOCK",
          message: `테스트케이스가 없는 문항: ${emptyTestCaseProblems.map((p) => p.title).join(", ")}`,
        },
  );

  const zeroPointProblems = problems.filter((problem) => problem.pointsTotal === 0);
  items.push(
    zeroPointProblems.length === 0
      ? { key: "pointsTotal", level: "PASS", message: "모든 문항의 배점 합계가 0보다 큽니다." }
      : {
          key: "pointsTotal",
          level: "BLOCK",
          message: `배점 합계가 0인 문항: ${zeroPointProblems.map((p) => p.title).join(", ")}`,
        },
  );

  items.push(
    quiz.accessCode.trim().length > 0
      ? { key: "accessCodeValid", level: "PASS", message: "출입코드가 설정되어 있습니다." }
      : { key: "accessCodeValid", level: "BLOCK", message: "출입코드가 비어 있습니다." },
  );

  items.push(
    quiz.startAt.toMillis() < quiz.endAt.toMillis()
      ? { key: "periodOrder", level: "PASS", message: "응시 기간 순서가 올바릅니다." }
      : { key: "periodOrder", level: "BLOCK", message: "종료 시각이 시작 시각보다 앞섭니다." },
  );

  if (quiz.courseId) {
    const rosterSnap = await db
      .collection("rosters")
      .where("courseId", "==", quiz.courseId)
      .limit(1)
      .get();
    items.push(
      rosterSnap.empty
        ? {
            // enterQuiz가 Classroom 연동 퀴즈는 명부(rosters)로만 신원을 확인하고 학번/이름
            // 직접입력·자체등록 같은 대체 경로가 없다 — 동기화 전이면 학생이 아무도 입장할
            // 수 없으므로 WARN이 아니라 BLOCK이어야 한다.
            key: "classroomRosterSync",
            level: "BLOCK",
            message: "수강생 명단이 아직 동기화되지 않아 학생이 입장할 수 없습니다. 먼저 수강생 동기화를 실행해주세요.",
          }
        : { key: "classroomRosterSync", level: "PASS", message: "수강생 명단이 동기화되어 있습니다." },
    );

    items.push(
      quiz.courseWorkId
        ? { key: "classroomDeployment", level: "PASS", message: "Classroom에 배포되어 있습니다." }
        : {
            key: "classroomDeployment",
            level: "WARN",
            message: "아직 Classroom에 배포되지 않았습니다.",
          },
    );
  }

  const blockingCount = items.filter((item) => item.level === "BLOCK").length;
  return { items, blockingCount };
}
