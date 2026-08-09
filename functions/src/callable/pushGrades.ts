import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { createCallable } from "../shared/callableFactory";
import { pushGradesSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError } from "../shared/errors";
import { listCourseStudents, listStudentSubmissions, patchGrade } from "../services/classroomClient";
import type { Participant, Quiz, Student } from "../models/types";

/**
 * FR-030~031. 학번 → (students.email) → (Classroom userId) → (courseWork 제출물) 연결이
 * 끊기는 학생은 건너뛰고 사유를 서버 로그에 남긴다 — `gradePushedAt`을 성공한 참가자에만
 * 기록해 이후 `batchGrade`의 `classroomGradesPending` 판단이 정확해진다(research.md §19).
 */
export const pushGrades = createCallable(pushGradesSchema, async ({ data, authEmail }) => {
  requireTeacher(authEmail);
  const db = getFirestore();
  const quizRef = db.collection("quizzes").doc(data.quizId);
  const quiz = (await quizRef.get()).data() as Quiz;

  if (!quiz.courseId || !quiz.courseWorkId) {
    throw domainError("NOT_DEPLOYED", "아직 Classroom에 배포되지 않은 퀴즈입니다.");
  }

  const participantsSnap = await db
    .collection("participants")
    .where("quizId", "==", data.quizId)
    .where("finalStatus", "==", "FINALIZED")
    .get();
  if (participantsSnap.empty) {
    throw domainError(
      "NO_FINALIZED_PARTICIPANTS",
      "확정 채점된 참가자가 없습니다. 먼저 일괄 채점을 실행해주세요.",
    );
  }

  const classroomStudents = await listCourseStudents(quiz.courseId);
  const userIdByEmail = new Map(classroomStudents.map((s) => [s.email, s.userId]));
  const submissions = await listStudentSubmissions(quiz.courseId, quiz.courseWorkId);
  const submissionIdByUserId = new Map(submissions.map((s) => [s.userId, s.submissionId]));

  let succeeded = 0;
  const failedStudentIds: string[] = [];

  for (const doc of participantsSnap.docs) {
    const participant = doc.data() as Participant;
    const student = (await db.collection("students").doc(participant.studentId).get()).data() as
      | Student
      | undefined;

    const userId = student?.email ? userIdByEmail.get(student.email) : undefined;
    const submissionId = userId ? submissionIdByUserId.get(userId) : undefined;

    if (!submissionId) {
      logger.warn("pushGrades: 학번-이메일-Classroom 사용자-제출물 연결 끊김", {
        quizId: data.quizId,
        studentId: participant.studentId,
      });
      failedStudentIds.push(participant.studentId);
      continue;
    }

    try {
      await patchGrade(quiz.courseId, quiz.courseWorkId, submissionId, participant.finalTotal);
      await doc.ref.update({ gradePushedAt: FieldValue.serverTimestamp() });
      succeeded += 1;
    } catch (cause) {
      logger.error("pushGrades: Classroom 성적 반영 실패", { studentId: participant.studentId, cause });
      failedStudentIds.push(participant.studentId);
    }
  }

  return { succeeded, failed: failedStudentIds.length, failedStudentIds };
});
