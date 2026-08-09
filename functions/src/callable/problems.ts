import { getFirestore, FieldValue, type Timestamp } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { deleteProblemSchema, upsertProblemSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";

/**
 * 문항 메타데이터(제목·설명·초기코드·maxRuns)만 다룬다. `pointsTotal`/`updatedAt`은
 * 신규 생성 시에만 초기화하고, 이후 이 함수는 절대 건드리지 않는다 — 그 둘의 소유자는
 * `upsertTestCase`/`deleteTestCase`뿐이다(data-model.md "pointsTotal/updatedAt의 소유권").
 */
export const upsertProblem = createCallable(upsertProblemSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();
  const problemsRef = db.collection("quizzes").doc(data.quizId).collection("problems");

  const metadata = {
    order: data.order,
    title: data.title,
    description: data.description,
    initialCode: data.initialCode,
    maxRuns: data.maxRuns,
  };

  if (data.problemId) {
    const problemRef = problemsRef.doc(data.problemId);
    await problemRef.update(metadata);
    const problem = (await problemRef.get()).data()!;
    return { problemId: data.problemId, pointsTotal: problem.pointsTotal as number };
  }

  const problemRef = problemsRef.doc();
  const secretsRef = db
    .collection("quizzes")
    .doc(data.quizId)
    .collection("problemSecrets")
    .doc(problemRef.id);

  const batch = db.batch();
  batch.set(problemRef, {
    ...metadata,
    pointsTotal: 0,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  batch.set(secretsRef, { items: [], updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();

  return { problemId: problemRef.id, pointsTotal: 0 };
});

/**
 * 하드 삭제가 아니라 `deletedAt`을 설정하는 소프트 삭제다 — Firestore에 캐스케이드 삭제가
 * 없어 하드 삭제하면 `problemSecrets`가 고아로 남기 때문(data-model.md).
 */
export const deleteProblem = createCallable(deleteProblemSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();
  const problemRef = db
    .collection("quizzes")
    .doc(data.quizId)
    .collection("problems")
    .doc(data.problemId);

  await problemRef.update({ deletedAt: FieldValue.serverTimestamp() });
  const problem = (await problemRef.get()).data()!;
  return { ok: true as const, deletedAt: (problem.deletedAt as Timestamp).toMillis() };
});
