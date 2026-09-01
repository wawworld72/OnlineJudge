import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { enterQuizSchema } from "../shared/schemas";
import {
  normalizeStudentId,
  resolveClassroomIdentity,
  verifyStudentIdentity,
} from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import { isAfter, isBefore } from "../shared/timeAuthority";
import { domainError } from "../shared/errors";
import type { Participant, Problem, Quiz } from "../models/types";

/**
 * `minInstances: 1`은 쓰지 않는다 — Cloud Functions 2세대는 minInstances>0이면 그
 * 인스턴스의 CPU·메모리 대기 시간을 호출 여부와 무관하게 24시간 내내 과금한다.
 * 응시 시작 직후 학생들이 몰리는 시점의 콜드 스타트 지연(수 초)보다, 수업 없는
 * 시간까지 상시 과금되는 비용이 더 크다고 판단해 기본값(콜드 스타트 감수)으로 둔다.
 */
export const enterQuiz = createCallable(enterQuizSchema, async ({ data, authEmail }) => {
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) {
    throw domainError("QUIZ_NOT_OPEN", "존재하지 않는 퀴즈입니다.");
  }
  const quiz = quizSnap.data() as Quiz;

  if (quiz.accessCode !== data.accessCode) {
    throw domainError("INVALID_ACCESS_CODE", "출입코드가 일치하지 않습니다.");
  }

  // Classroom 연동 퀴즈는 "Classroom에 등록된 학생은 이미 검증됐다"는 전제로, 학번/이름을
  // 직접 입력받지 않고 로그인 이메일로 그 강의 명부에서 신원을 바로 찾는다(문제가 있는
  // 학생은 교사가 Classroom에서 직접 제외). 비연동 퀴즈는 기존처럼 학번/이름/이메일
  // 3중 대조를 그대로 요구한다.
  let studentId: string;
  let studentName: string;
  if (quiz.courseId) {
    const identity = await resolveClassroomIdentity(db, { courseId: quiz.courseId, authEmail });
    studentId = identity.studentId;
    studentName = identity.name;
  } else {
    if (!data.studentId || !data.name) {
      throw domainError("INVALID_REQUEST", "학번과 이름을 입력해주세요.");
    }
    studentId = normalizeStudentId(data.studentId);
    studentName = data.name;
    await verifyStudentIdentity(db, { studentId, name: studentName, authEmail });
  }

  const participantId = computeParticipantId(data.quizId, studentId);
  const participantRef = db.collection("participants").doc(participantId);
  const participantSnap = await participantRef.get();

  // 이미 제출/채점이 끝난 참가자는 "새로 응시"가 아니라 "지난 결과 복기"이므로,
  // 퀴즈가 CLOSED 상태거나 종료 시각을 지났어도 막지 않는다 — 시험이 끝난 뒤에도
  // 학생이 자기 결과를 다시 확인할 수 있어야 한다(FR-024). 아직 IN_PROGRESS이거나
  // 최초 응시라면 지금도 응시 가능한 시간인지를 그대로 확인한다.
  const isReviewOnly =
    participantSnap.exists && (participantSnap.data() as Participant).finalStatus !== "IN_PROGRESS";
  if (!isReviewOnly) {
    if (quiz.status !== "OPEN") {
      throw domainError("QUIZ_NOT_OPEN", "지금은 응시할 수 없는 퀴즈입니다.");
    }
    // 출입코드/학번과 무관한, 시간 문제라는 걸 클라이언트가 구분해 보여줄 수 있도록
    // 상태(DRAFT/CLOSED)와 시간 범위 이탈(너무 이르거나 늦음)을 서로 다른 코드로 던진다.
    if (isBefore(quiz.startAt)) {
      throw domainError("QUIZ_NOT_STARTED", "아직 시작 시각이 되지 않았습니다.");
    }
    if (isAfter(quiz.endAt)) {
      throw domainError("QUIZ_ENDED", "종료 시각이 지나 더 이상 응시할 수 없습니다.");
    }
  }

  let participant: Participant;
  if (participantSnap.exists) {
    participant = participantSnap.data() as Participant;
  } else {
    const newParticipant: Participant = {
      quizId: data.quizId,
      studentId,
      enteredAt: FieldValue.serverTimestamp() as never,
      finalStatus: "IN_PROGRESS",
      finalSubmittedAt: null,
      finalTotal: 0,
      runsUsedByProblem: {},
      submissions: {},
      runResults: {},
      gradePushedAt: null,
    };
    try {
      // `.create()`는 문서가 이미 있으면 실패한다 — 동시에 두 요청이 함께 "없음"을 보고
      // 동시에 생성을 시도해도 정확히 한쪽만 성공해 재입장 멱등성이 깨지지 않는다.
      await participantRef.create(newParticipant);
      participant = newParticipant;
    } catch {
      participant = (await participantRef.get()).data() as Participant;
    }
  }

  const problemsSnap = await quizRef
    .collection("problems")
    .where("deletedAt", "==", null)
    .orderBy("order")
    .get();

  const problems = problemsSnap.docs.map((doc) => {
    const problem = doc.data() as Problem;
    const maxRuns = problem.maxRuns ?? quiz.maxRunsPerProblem;
    const used = participant.runsUsedByProblem[doc.id] ?? 0;
    return {
      problemId: doc.id,
      title: problem.title,
      description: problem.description,
      initialCode: problem.initialCode,
      maxRuns,
      remainingRuns: Math.max(0, maxRuns - used),
      pointsTotal: problem.pointsTotal,
    };
  });

  const response: {
    participantStatus: Participant["finalStatus"];
    problems: typeof problems;
    startAt: number;
    endAt: number;
    quizTitle: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    existingSubmission?: Participant["submissions"];
    gradedResult?: Participant["runResults"];
  } = {
    participantStatus: participant.finalStatus,
    problems,
    startAt: quiz.startAt.toMillis(),
    endAt: quiz.endAt.toMillis(),
    quizTitle: quiz.title,
    studentId,
    studentName,
    studentEmail: authEmail,
  };

  if (participant.finalStatus !== "IN_PROGRESS") {
    response.existingSubmission = participant.submissions;
    response.gradedResult = participant.runResults;
  }

  return response;
});
