import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { createCallable } from "../shared/callableFactory";
import { pushGradesSchema } from "../shared/schemas";
import { requireTeacher } from "../shared/authorization";
import { domainError, systemError } from "../shared/errors";
import { processInChunks } from "../shared/chunkedConcurrency";
import { getClassroomTeacherEmail } from "../config";
import {
  listCourseStudents,
  listStudentSubmissions,
  patchGrade,
} from "../services/classroomClient";
import type { Participant, Quiz, Student } from "../models/types";

const CONCURRENCY = 10;

/**
 * FR-030~031. 학번 → (students.email) → (Classroom userId) → (courseWork 제출물) 연결이
 * 끊기는 학생은 건너뛰고 사유를 서버 로그에 남긴다 — `gradePushedAt`을 성공한 참가자에만
 * 기록해 이후 `batchGrade`의 `classroomGradesPending` 판단이 정확해진다(research.md §19).
 * `batchGrade`와 같은 이유(research.md §15)로 참가자 수만큼 순차 처리하면 100명 규모에서
 * 기본 타임아웃(60초)을 넘겨 처리 중간에 함수가 죽을 수 있다 — `students` 조회는
 * `getAll()`로 한 번에 배치 조회하고, Classroom 성적 반영은 `batchGrade`와 동일하게
 * `timeoutSeconds` 상향 + 청크 병렬 처리로 바꾼다.
 */
export const pushGrades = createCallable(
  pushGradesSchema,
  async ({ data, isTeacher }) => {
    requireTeacher(isTeacher);
    const db = getFirestore();
    const quizRef = db.collection("quizzes").doc(data.quizId);
    const quiz = (await quizRef.get()).data() as Quiz;

    if (!quiz.courseId || !quiz.courseWorkId) {
      throw domainError("NOT_DEPLOYED", "아직 Classroom에 배포되지 않은 퀴즈입니다.");
    }
    const courseId = quiz.courseId;
    const courseWorkId = quiz.courseWorkId;

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

    const classroomTeacherEmail = getClassroomTeacherEmail();
    let classroomStudents, submissions;
    try {
      classroomStudents = await listCourseStudents(courseId, classroomTeacherEmail);
      submissions = await listStudentSubmissions(courseId, courseWorkId, classroomTeacherEmail);
    } catch (cause) {
      throw systemError("pushGrades.listCourseStudentsOrSubmissions", cause);
    }
    const userIdByEmail = new Map(classroomStudents.map((s) => [s.email, s.userId]));
    const submissionIdByUserId = new Map(submissions.map((s) => [s.userId, s.submissionId]));

    const participants = participantsSnap.docs.map((doc) => ({
      ref: doc.ref,
      participant: doc.data() as Participant,
    }));
    const studentSnaps = await db.getAll(
      ...participants.map(({ participant }) =>
        db.collection("students").doc(participant.studentId),
      ),
    );
    const studentByStudentId = new Map(
      studentSnaps.map((snap) => [snap.id, snap.data() as Student | undefined]),
    );

    const outcomes = await processInChunks(
      participants,
      CONCURRENCY,
      async ({ ref, participant }) => {
        const student = studentByStudentId.get(participant.studentId);
        const userId = student?.email ? userIdByEmail.get(student.email) : undefined;
        const submissionId = userId ? submissionIdByUserId.get(userId) : undefined;

        if (!submissionId) {
          logger.warn("pushGrades: 학번-이메일-Classroom 사용자-제출물 연결 끊김", {
            quizId: data.quizId,
            studentId: participant.studentId,
          });
          return { ok: false as const, studentId: participant.studentId };
        }

        try {
          await patchGrade(
            courseId,
            courseWorkId,
            submissionId,
            participant.finalTotal,
            classroomTeacherEmail,
          );
          await ref.update({ gradePushedAt: FieldValue.serverTimestamp() });
          return { ok: true as const, studentId: participant.studentId };
        } catch (cause) {
          logger.error("pushGrades: Classroom 성적 반영 실패", {
            studentId: participant.studentId,
            cause,
          });
          return { ok: false as const, studentId: participant.studentId };
        }
      },
    );

    const failed = outcomes.filter((o) => !o.ok);
    return {
      succeeded: outcomes.length - failed.length,
      failed: failed.length,
      failedStudentIds: failed.map((f) => f.studentId),
    };
  },
  { timeoutSeconds: 540 },
);
