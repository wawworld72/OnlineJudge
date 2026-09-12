/**
 * quickstart.md의 "사전 준비" 절이 요구하는 최소 시드 데이터를 Firestore 에뮬레이터에 넣는다.
 * 사용법: 에뮬레이터를 먼저 띄운 뒤 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ts-node
 * functions/scripts/seed.ts` (또는 `npx tsx functions/scripts/seed.ts`)로 실행한다.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

async function seed() {
  const app = initializeApp({ projectId: "demo-c-quiz-judge-system" });
  const db = getFirestore(app);

  await db.collection("students").doc("S001").set({
    name: "홍길동",
    email: null,
    status: "ACTIVE",
  });

  await db
    .collection("quizzes")
    .doc("Q1")
    .set({
      title: "퀵스타트 검증용 퀴즈",
      description: "quickstart.md 시나리오용 시드 데이터",
      startAt: Timestamp.fromMillis(Date.now() - 60_000),
      endAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      accessCode: "ABCD",
      status: "DRAFT",
      maxRunsPerProblem: 10,
      courseId: null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
      timerDurationMs: 30 * 60 * 1000,
      pausedAt: null,
    });

  await db.collection("quizzes").doc("Q1").collection("problems").doc("P1").set({
    order: 0,
    title: "문제1",
    description: "두 정수의 합을 출력하시오.",
    initialCode: "#include <stdio.h>\nint main(void) {\n  return 0;\n}\n",
    maxRuns: null,
    pointsTotal: 0,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });

  await db
    .collection("quizzes")
    .doc("Q1")
    .collection("problemSecrets")
    .doc("P1")
    .set({
      items: [
        {
          tcId: "TC1",
          tcNo: 1,
          input: "1 2",
          expected: "3",
          points: 60,
          isPublic: true,
          description: "공개 테스트케이스",
        },
        {
          tcId: "TC2",
          tcNo: 2,
          input: "10 20",
          expected: "30",
          points: 40,
          isPublic: false,
          description: "비공개 테스트케이스",
        },
      ],
      updatedAt: FieldValue.serverTimestamp(),
    });
  await db
    .collection("quizzes")
    .doc("Q1")
    .collection("problems")
    .doc("P1")
    .update({ pointsTotal: 100 });

  console.log(
    "시드 완료: students/S001, quizzes/Q1, quizzes/Q1/problems/P1, quizzes/Q1/problemSecrets/P1",
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
