import { z } from "zod";

/**
 * Firestore는 스키마를 강제하지 않으므로(research.md §7), Callable Function 요청과
 * Firestore에 쓰는 값의 실제 타입 강제는 이 Zod 스키마가 런타임에 책임진다.
 */

export const teacherLoginSchema = z.object({
  accessCode: z.string().min(1),
});

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
  // Classroom 연동 퀴즈는 로그인 이메일로 명부(rosters)에서 신원을 바로 찾으므로
  // 클라이언트가 이 둘을 보내지 않는다(enterQuiz.ts) — 비연동 퀴즈만 여전히 요구한다.
  studentId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
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
  subjectName: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  startAt: z.number(),
  endAt: z.number(),
  accessCode: z.string().min(1),
  maxRunsPerProblem: z.number().int().positive(),
  courseId: z.string().min(1).nullable(),
});

/**
 * Google Apps Script(스프레드시트 기반 퀴즈 생성/갱신, `upsertQuizFromSheet`)용 스키마.
 * `upsertQuizSchema`(항상 전체 필수, 웹 UI 전용)와는 별개다 — 생성은 전체 필수, 갱신은
 * 보낸 필드만 바뀌는 부분(PATCH) 갱신이어야 해서 모든 필드를 optional로 두고, 생성인지
 * (quizId/quizUrl이 둘 다 없음) 판별해 그때만 필수 필드를 강제하는 규칙을 아래
 * `superRefine`으로 추가한다. `problems`/`testCases`는 내부 Firestore ID(`problemId`/
 * `tcId`)를 모르는 GAS가 그래도 부분 갱신할 수 있도록 `title`/`tcNo`로 매칭한다
 * (services/quizSheetSync.ts) — "신규 항목인데 필수 필드가 빠졌다" 같은 규칙은 기존
 * 항목 조회가 필요해 스키마만으로는 표현할 수 없어 그 서비스 레이어가 책임진다.
 */
export const sheetTestCaseSchema = z.object({
  tcNo: z.number().int().nonnegative(),
  input: z.string().optional(),
  expected: z.string().optional(),
  points: z.number().nonnegative().optional(),
  isPublic: z.boolean().optional(),
  description: z.string().optional(),
});

export const sheetProblemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  initialCode: z.string().optional(),
  maxRuns: z.number().int().positive().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
  // 정상적인 퀴즈보다 훨씬 넉넉한 상한 — 실수로 비정상적으로 큰 요청이 들어오는 것만
  // 막는 저비용 방어선이다(정상 사용은 절대 안 걸림).
  testCases: z.array(sheetTestCaseSchema).max(200).optional(),
});

export const sheetUpsertQuizSchema = z
  .object({
    quizUrl: z.string().min(1).optional(),
    quizId: z.string().min(1).optional(),
    subjectName: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    startAt: z.union([z.number(), z.string().min(1)]).optional(),
    endAt: z.union([z.number(), z.string().min(1)]).optional(),
    accessCode: z.string().min(1).optional(),
    maxRunsPerProblem: z.number().int().positive().optional(),
    courseId: z.string().min(1).nullable().optional(),
    problems: z.array(sheetProblemSchema).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.quizId || val.quizUrl) return; // 갱신 — 부분 갱신이므로 전부 optional 그대로.
    const requiredForCreate = [
      "subjectName",
      "title",
      "description",
      "startAt",
      "endAt",
      "accessCode",
      "maxRunsPerProblem",
    ] as const;
    for (const field of requiredForCreate) {
      if (val[field] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "신규 퀴즈 생성 시 필수 항목입니다.",
        });
      }
    }
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

/**
 * 실제 Classroom 계정 없이 Classroom 연동 퀴즈의 학생 화면을 테스트할 수 있도록,
 * 명부(rosters)에 항목 하나를 수동으로 추가하는 `addTestRosterEntry`용 스키마.
 */
export const addTestRosterEntrySchema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
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
