import {
  getFirestore,
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { deleteQuizDataSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import type { Quiz } from "../models/types";

const BATCH_CHUNK_SIZE = 400;

async function deleteAllDocs(db: Firestore, refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_CHUNK_SIZE)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

/**
 * FR-039~040. 삭제는 복구할 수 없다 — 아카이브가 없는 상태에서의 삭제는 명시적 확인
 * (`confirmWithoutArchive: true`)이 있어야만 강행된다. 퀴즈 문서 자체는 지우지 않고
 * `deletedAt`만 설정한다(data-model.md — "설정되면 하위 데이터는 이미 제거됨"이 그
 * 의미이며, 퀴즈 문서는 이력 조회를 위해 남긴다).
 */
export const deleteQuizData = createCallable(deleteQuizDataSchema, async ({ data, isTeacher }) => {
  requireTeacher(isTeacher);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  if (!quiz.archivedAt && !data.confirmWithoutArchive) {
    throw domainError(
      "NOT_ARCHIVED_YET",
      "아직 아카이브하지 않았습니다. 아카이브 없이 삭제하려면 다시 확인해주세요.",
    );
  }

  const problemsSnap = await quizRef.collection("problems").get();
  const secretsSnap = await quizRef.collection("problemSecrets").get();
  const participantsSnap = await db
    .collection("participants")
    .where("quizId", "==", data.quizId)
    .get();

  await deleteAllDocs(db, [
    ...problemsSnap.docs.map((doc) => doc.ref),
    ...secretsSnap.docs.map((doc) => doc.ref),
    ...participantsSnap.docs.map((doc) => doc.ref),
  ]);

  await quizRef.update({ deletedAt: FieldValue.serverTimestamp() });
  const deletedQuiz = (await quizRef.get()).data() as Quiz;

  return { ok: true as const, deletedAt: deletedQuiz.deletedAt!.toMillis() };
});
