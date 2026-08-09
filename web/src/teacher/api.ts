import { callFunction } from "../shared/functionsClient";

export type QuizStatus = "DRAFT" | "OPEN" | "CLOSED";

export interface QuizListItem {
  quizId: string;
  title: string;
  status: QuizStatus;
  startAt: number;
  endAt: number;
}

export function listQuizzes() {
  return callFunction<Record<string, never>, { quizzes: QuizListItem[] }>("listQuizzes", {});
}

export interface TestCaseDetail {
  tcId: string;
  tcNo: number;
  input: string;
  expected: string;
  points: number;
  isPublic: boolean;
  description: string;
}

export interface ProblemDetail {
  problemId: string;
  order: number;
  title: string;
  description: string;
  initialCode: string;
  maxRuns: number | null;
  pointsTotal: number;
  testCases: TestCaseDetail[];
}

export interface QuizDetail {
  quizId: string;
  title: string;
  description: string;
  startAt: number;
  endAt: number;
  accessCode: string;
  status: QuizStatus;
  maxRunsPerProblem: number;
  courseId: string | null;
  problems: ProblemDetail[];
}

export function getQuizForEdit(input: { quizId: string }) {
  return callFunction<typeof input, QuizDetail>("getQuizForEdit", input);
}

export interface UpsertQuizInput {
  quizId?: string;
  title: string;
  description: string;
  startAt: number;
  endAt: number;
  accessCode: string;
  maxRunsPerProblem: number;
  courseId: string | null;
}

export function upsertQuiz(input: UpsertQuizInput) {
  return callFunction<UpsertQuizInput, { quizId: string; status: QuizStatus }>(
    "upsertQuiz",
    input,
  );
}

export interface UpsertProblemInput {
  quizId: string;
  problemId?: string;
  order: number;
  title: string;
  description: string;
  initialCode: string;
  maxRuns: number | null;
}

export function upsertProblem(input: UpsertProblemInput) {
  return callFunction<UpsertProblemInput, { problemId: string; pointsTotal: number }>(
    "upsertProblem",
    input,
  );
}

export function deleteProblem(input: { quizId: string; problemId: string }) {
  return callFunction<typeof input, { ok: true; deletedAt: number }>("deleteProblem", input);
}

export interface UpsertTestCaseInput {
  quizId: string;
  problemId: string;
  testCase: {
    tcId?: string;
    tcNo: number;
    input: string;
    expected: string;
    points: number;
    isPublic: boolean;
    description: string;
  };
}

export function upsertTestCase(input: UpsertTestCaseInput) {
  return callFunction<UpsertTestCaseInput, { tcId: string; pointsTotal: number; testCaseCount: number }>(
    "upsertTestCase",
    input,
  );
}

export function deleteTestCase(input: { quizId: string; problemId: string; tcId: string }) {
  return callFunction<typeof input, { pointsTotal: number; testCaseCount: number }>(
    "deleteTestCase",
    input,
  );
}

export type CheckLevel = "PASS" | "WARN" | "BLOCK";
export interface CheckItem {
  key: string;
  level: CheckLevel;
  message: string;
}

export function runPreDeployCheck(input: { quizId: string }) {
  return callFunction<typeof input, { items: CheckItem[]; blockingCount: number }>(
    "runPreDeployCheck",
    input,
  );
}

export function setQuizStatus(input: { quizId: string; status: QuizStatus }) {
  return callFunction<typeof input, { status: QuizStatus }>("setQuizStatus", input);
}

export interface BatchGradeResponse {
  processed: number;
  skipped: number;
  failed: number;
  failedParticipantIds: string[];
  classroomGradesPending: boolean;
}

export function batchGrade(input: { quizId: string }) {
  return callFunction<typeof input, BatchGradeResponse>("batchGrade", input);
}
