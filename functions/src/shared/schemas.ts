import { z } from "zod";

/**
 * Firestore는 스키마를 강제하지 않으므로(research.md §7), Callable Function 요청과
 * Firestore에 쓰는 값의 실제 타입 강제는 이 Zod 스키마가 런타임에 책임진다.
 */

export const testCaseInputSchema = z.object({
  tcId: z.string().min(1).nullish(),
  tcNo: z.number().int().nonnegative(),
  input: z.string(),
  expected: z.string(),
  points: z.number().nonnegative(),
  isPublic: z.boolean(),
  description: z.string(),
});

export const enterQuizSchema = z.object({
  quizId: z.string().min(1),
  accessCode: z.string().min(1),
  studentId: z.string().min(1),
  name: z.string().min(1),
});

export const registerStudentEmailSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
});

export const practiceRunSchema = z.object({
  quizId: z.string().min(1),
  problemId: z.string().min(1),
  code: z.string(),
});

export const finalSubmitSchema = z.object({
  quizId: z.string().min(1),
  submissions: z.array(
    z.object({
      problemId: z.string().min(1),
      code: z.string(),
    }),
  ),
});

export const getMyResultSchema = z.object({
  quizId: z.string().min(1),
});

export const listQuizzesSchema = z.object({});

export const getQuizForEditSchema = z.object({
  quizId: z.string().min(1),
});

export const upsertQuizSchema = z.object({
  quizId: z.string().min(1).nullish(),
  title: z.string().min(1),
  description: z.string(),
  startAt: z.number(),
  endAt: z.number(),
  accessCode: z.string().min(1),
  maxRunsPerProblem: z.number().int().positive(),
  courseId: z.string().min(1).nullable(),
});

export const upsertProblemSchema = z.object({
  quizId: z.string().min(1),
  problemId: z.string().min(1).nullish(),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  description: z.string(),
  initialCode: z.string(),
  maxRuns: z.number().int().positive().nullable(),
});

export const deleteProblemSchema = z.object({
  quizId: z.string().min(1),
  problemId: z.string().min(1),
});

export const upsertTestCaseSchema = z.object({
  quizId: z.string().min(1),
  problemId: z.string().min(1),
  testCase: testCaseInputSchema,
});

export const deleteTestCaseSchema = z.object({
  quizId: z.string().min(1),
  problemId: z.string().min(1),
  tcId: z.string().min(1),
});

export const runPreDeployCheckSchema = z.object({
  quizId: z.string().min(1),
});

export const setQuizStatusSchema = z.object({
  quizId: z.string().min(1),
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]),
});

export const batchGradeSchema = z.object({
  quizId: z.string().min(1),
});

export const getParticipantOverviewSchema = z.object({
  quizId: z.string().min(1),
});

export const getParticipantDetailSchema = z.object({
  quizId: z.string().min(1),
  studentId: z.string().min(1),
});

export const syncRosterSchema = z.object({
  courseId: z.string().min(1),
});

export const deployClassroomAssignmentSchema = z.object({
  quizId: z.string().min(1),
});

export const resetClassroomDeploymentSchema = z.object({
  quizId: z.string().min(1),
});

export const pushGradesSchema = z.object({
  quizId: z.string().min(1),
});

export const archiveQuizSchema = z.object({
  quizId: z.string().min(1),
});

export const deleteQuizDataSchema = z.object({
  quizId: z.string().min(1),
  confirmWithoutArchive: z.boolean().nullish(),
});
