/**
 * 참가자 문서ID를 서버에서 항상 재계산한다 — 클라이언트가 참가자ID를 직접 보내오더라도
 * 절대 신뢰하지 않는다(헌법 I, 서버 신뢰 경계). 호출자는 신원 검증을 통과한 `studentId`만
 * 이 함수에 넘겨야 한다.
 */
export function computeParticipantId(quizId: string, studentId: string): string {
  return `${quizId}_${studentId}`;
}
