import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createCallable } from "../shared/callableFactory";
import { enterQuizSchema } from "../shared/schemas";
import { normalizeStudentId, verifyStudentIdentity } from "../shared/identity";
import { computeParticipantId } from "../shared/participantId";
import { isWithin } from "../shared/timeAuthority";
import { domainError } from "../shared/errors";
import type { Participant, Problem, Quiz } from "../models/types";

/**
 * `minInstances: 1`로 콜드 스타트를 없앤다 — 응시 시작 직후 학생들이 몰리는 시점이라
 * 지연이 가장 체감되기 쉽다(research.md §14 관련).
 */
export const enterQuiz = createCallable(
  enterQuizSchema,
  async ({ data, authEmail }) => {
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

    if (quiz.status !== "OPEN" || !isWithin(quiz.startAt, quiz.endAt)) {
      throw domainError("QUIZ_NOT_OPEN", "지금은 응시할 수 없는 퀴즈입니다.");
    }

    const studentId = normalizeStudentId(data.studentId);

    await verifyStudentIdentity(db, {
      studentId,
      name: data.name,
      authEmail,
    });

    const participantId = computeParticipantId(data.quizId, studentId);
    const participantRef = db.collection("participants").doc(participantId);
    const participantSnap = await participantRef.get();

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
        completedCount: 0,
        totalCount: 0,
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
      studentName: data.name,
      studentEmail: authEmail,
    };

    if (participant.finalStatus !== "IN_PROGRESS") {
      response.existingSubmission = participant.submissions;
      response.gradedResult = participant.runResults;
    }

    return response;
  },
  { minInstances: 1 },
);
