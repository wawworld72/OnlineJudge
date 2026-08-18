import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb, ts } from "../testEnv";
import { getParticipantOverview } from "../../src/callable/getParticipantOverview";
import type { OverviewItem } from "../../src/services/participantOverview";
import { getParticipantDetail } from "../../src/callable/getParticipantDetail";

const QUIZ_ID = "quiz-1";
const COURSE_ID = "course-1";

async function seedRosterEntry(studentId: string, name: string) {
  await testDb()
    .collection("rosters")
    .doc(`${COURSE_ID}_${studentId}`)
    .set({
      courseId: COURSE_ID,
      studentId,
      name,
      email: `${studentId}@hoseo.edu`,
      syncedAt: FieldValue.serverTimestamp(),
    });
}

async function seedParticipant(
  studentId: string,
  finalStatus: "IN_PROGRESS" | "SUBMITTED" | "FINALIZED",
) {
  await testDb()
    .collection("participants")
    .doc(`${QUIZ_ID}_${studentId}`)
    .set({
      quizId: QUIZ_ID,
      studentId,
      enteredAt: FieldValue.serverTimestamp(),
      finalStatus,
      finalSubmittedAt: finalStatus === "IN_PROGRESS" ? null : Timestamp.now(),
      finalTotal: finalStatus === "FINALIZED" ? 100 : 0,
      runsUsedByProblem: {},
      submissions:
        finalStatus === "IN_PROGRESS"
          ? {}
          : { p1: { code: "int main(){}", submittedAt: Timestamp.now() } },
      runResults:
        finalStatus === "FINALIZED"
          ? {
              p1: {
                status: "AC",
                score: 100,
                maxScore: 100,
                compileErrorMessage: null,
                tcResults: [],
              },
            }
          : {},
      gradePushedAt: null,
    });
}

describe("교사의 참가자 현황 조회 (현황 조회 → 상세 열람)", () => {
  beforeEach(async () => {
    await clearFirestore();
    await testDb()
      .collection("quizzes")
      .doc(QUIZ_ID)
      .set({
        title: "중간고사",
        description: "",
        startAt: ts(-60_000),
        endAt: ts(60_000),
        accessCode: "ABC123",
        status: "OPEN",
        maxRunsPerProblem: 5,
        courseId: COURSE_ID,
        courseWorkId: null,
        courseWorkLink: null,
        archivedAt: null,
        archiveSpreadsheetUrl: null,
        deletedAt: null,
      });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("응시중/제출완료/채점완료/미입장이 섞인 상태를 조회한 뒤 개별 학생 상세를 열람한다", async () => {
    await seedRosterEntry("in-progress-id", "응시중학생");
    await seedRosterEntry("submitted-id", "제출완료학생");
    await seedRosterEntry("finalized-id", "채점완료학생");
    await seedRosterEntry("not-entered-id", "미입장학생");
    await seedParticipant("in-progress-id", "IN_PROGRESS");
    await seedParticipant("submitted-id", "SUBMITTED");
    await seedParticipant("finalized-id", "FINALIZED");

    const overview = await getParticipantOverview.run(makeTeacherRequest({ quizId: QUIZ_ID }));
    const participants = overview.participants as OverviewItem[];
    expect(participants).toHaveLength(4);
    const statuses = Object.fromEntries(participants.map((p) => [p.studentId, p.status]));
    expect(statuses).toEqual({
      "in-progress-id": "IN_PROGRESS",
      "submitted-id": "SUBMITTED",
      "finalized-id": "FINALIZED",
      "not-entered-id": "NOT_ENTERED",
    });

    const detail = await getParticipantDetail.run(
      makeTeacherRequest({ quizId: QUIZ_ID, studentId: "finalized-id" }),
    );
    expect(detail.runResults.p1.score).toBe(100);
  });
});
