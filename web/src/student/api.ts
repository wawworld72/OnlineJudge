import { callFunction } from "../shared/functionsClient";

export interface ProblemSummary {
  problemId: string;
  title: string;
  description: string;
  initialCode: string;
  maxRuns: number;
  remainingRuns: number;
  pointsTotal: number;
}

export type ParticipantStatus = "IN_PROGRESS" | "SUBMITTED" | "FINALIZED";

export interface EnterQuizResponse {
  participantStatus: ParticipantStatus;
  problems: ProblemSummary[];
  endAt: number;
  existingSubmission?: Record<string, { code: string; submittedAt: number }>;
  gradedResult?: Record<string, PerProblemResult>;
}

export function enterQuiz(input: {
  quizId: string;
  accessCode: string;
  studentId: string;
  name: string;
}) {
  return callFunction<typeof input, EnterQuizResponse>("enterQuiz", input);
}

export function registerStudentEmail(input: { studentId: string; name: string }) {
  return callFunction<typeof input, { ok: true }>("registerStudentEmail", input);
}

export interface TestCaseResult {
  tcId: string;
  passed: boolean;
  isPublic: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
}

export interface PracticeRunResponse {
  status: "AC" | "WA" | "CE";
  score: number;
  maxScore: number;
  compileErrorMessage: string | null;
  tcResults: TestCaseResult[];
  remainingRuns: number;
  usedCache: boolean;
}

export function practiceRun(input: { quizId: string; problemId: string; code: string }) {
  return callFunction<typeof input, PracticeRunResponse>("practiceRun", input);
}

export interface FinalSubmitResponse {
  participantStatus: "SUBMITTED";
  finalSubmittedAt: number | null;
}

export function finalSubmit(input: {
  quizId: string;
  submissions: Array<{ problemId: string; code: string }>;
}) {
  return callFunction<typeof input, FinalSubmitResponse>("finalSubmit", input);
}

export interface PerProblemResult {
  problemId: string;
  status: "AC" | "WA" | "CE";
  score: number;
  maxScore: number;
  tcResults: TestCaseResult[];
}

export interface GetMyResultResponse {
  participantStatus: ParticipantStatus;
  finalTotal?: number;
  maxTotal?: number;
  perProblem?: PerProblemResult[];
}

export function getMyResult(input: { quizId: string }) {
  return callFunction<typeof input, GetMyResultResponse>("getMyResult", input);
}
