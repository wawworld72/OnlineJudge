import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";
import { getParticipantDetail } from "../../src/callable/getParticipantDetail";

const QUIZ_ID = "quiz-1";
const STUDENT_ID = "20240001";

describe("getParticipantDetail", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("참가자 문서 1건의 submissions/runResults를 그대로 반환한다", async () => {
    await testDb()
      .collection("participants")
      .doc(`${QUIZ_ID}_${STUDENT_ID}`)
      .set({
        quizId: QUIZ_ID,
        studentId: STUDENT_ID,
        enteredAt: FieldValue.serverTimestamp(),
        finalStatus: "FINALIZED",
        finalSubmittedAt: Timestamp.now(),
        finalTotal: 100,
        runsUsedByProblem: {},
        submissions: { p1: { code: "int main(){}", submittedAt: Timestamp.now() } },
        runResults: {
          p1: { status: "AC", score: 100, maxScore: 100, compileErrorMessage: null, tcResults: [] },
        },
        gradePushedAt: null,
      });

    const response = await getParticipantDetail.run(
      makeTeacherRequest({ quizId: QUIZ_ID, studentId: STUDENT_ID }),
    );

    expect(response.submissions.p1.code).toBe("int main(){}");
    expect(response.runResults.p1.status).toBe("AC");
  });

  it("입장한 적 없는 학생을 조회하면 NOT_ENTERED로 거부한다", async () => {
    await expect(
      getParticipantDetail.run(makeTeacherRequest({ quizId: QUIZ_ID, studentId: "never-entered" })),
    ).rejects.toMatchObject({ details: { code: "NOT_ENTERED" } });
  });
});
