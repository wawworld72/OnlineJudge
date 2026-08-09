import { randomUUID } from "node:crypto";
import { getFirestore, FieldValue, type Transaction } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { deleteTestCaseSchema, upsertTestCaseSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import type { ProblemSecrets, TestCase } from "../models/types";

/**
 * `problemSecrets.items`와 `problems.pointsTotal`/`updatedAt`을 하나의 트랜잭션 안에서
 * 함께 쓴다 — 둘을 별도 쓰기로 나누면 `practiceRun`의 캐시 무효화 판단(`problems.updatedAt`
 * 기준)이 누락될 수 있다(data-model.md). 배점 합계는 항상 트랜잭션 내부에서 **다시 읽은**
 * `items` 배열을 기준으로 재계산한다 — 클라이언트가 보낸 값을 신뢰하지 않으므로, 같은 문항을
 * 두 탭에서 동시에 편집해도(서로 다른 테스트케이스 수정) Firestore의 트랜잭션 자동 재시도로
 * 두 수정 모두 최종 합계에 반영된다(lost-update 없음).
 */
async function applyTestCaseDelta(
  quizId: string,
  problemId: string,
  applyDelta: (items: TestCase[]) => TestCase[],
): Promise<{ items: TestCase[]; pointsTotal: number }> {
  const db = getFirestore();
  const secretsRef = db.collection("quizzes").doc(quizId).collection("problemSecrets").doc(problemId);
  const problemRef = db.collection("quizzes").doc(quizId).collection("problems").doc(problemId);

  return db.runTransaction(async (tx: Transaction) => {
    const secretsSnap = await tx.get(secretsRef);
    const secrets = secretsSnap.data() as ProblemSecrets;
    const items = applyDelta(secrets.items);
    const pointsTotal = items.reduce((sum, item) => sum + item.points, 0);

    tx.update(secretsRef, { items, updatedAt: FieldValue.serverTimestamp() });
    tx.update(problemRef, { pointsTotal, updatedAt: FieldValue.serverTimestamp() });

    return { items, pointsTotal };
  });
}

export const upsertTestCase = createCallable(upsertTestCaseSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const tcId = data.testCase.tcId ?? randomUUID();
  const newTestCase: TestCase = { ...data.testCase, tcId };

  const result = await applyTestCaseDelta(data.quizId, data.problemId, (items) => {
    const index = items.findIndex((item) => item.tcId === tcId);
    if (index === -1) return [...items, newTestCase];
    return items.map((item) => (item.tcId === tcId ? newTestCase : item));
  });

  return { tcId, pointsTotal: result.pointsTotal, testCaseCount: result.items.length };
});

export const deleteTestCase = createCallable(deleteTestCaseSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const result = await applyTestCaseDelta(data.quizId, data.problemId, (items) =>
    items.filter((item) => item.tcId !== data.tcId),
  );

  return { pointsTotal: result.pointsTotal, testCaseCount: result.items.length };
});
