import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { Participant } from "../models/types";
import { domainError } from "../shared/errors";

/**
 * 실행 횟수를 원자적으로 확인·차감한다(FR-014, research.md §5). `FieldValue.increment()`
 * 단독 사용은 조건("한도 미만일 때만")을 걸 수 없어 쓰지 않고, `tx.get()`으로 트랜잭션
 * 내부에서 최신 값을 다시 읽어 판단한다. 동시(`Promise.all`) 호출은 Firestore 트랜잭션의
 * 자동 재시도(커밋 시점에 읽은 문서가 바뀌었으면 재시도)로 직렬화되므로 한도를 넘지 않는다.
 */
export async function incrementRunCountOrThrow(
  db: Firestore,
  participantRef: DocumentReference,
  problemId: string,
  maxRuns: number,
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(participantRef);
    const participant = snap.data() as Participant;
    const current = participant.runsUsedByProblem[problemId] ?? 0;

    if (current >= maxRuns) {
      throw domainError("NO_RUNS_LEFT", "이 문항의 실행 횟수를 모두 사용했습니다.");
    }

    const next = current + 1;
    tx.update(participantRef, { [`runsUsedByProblem.${problemId}`]: next });
    return next;
  });
}
