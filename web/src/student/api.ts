import { callFunction } from "../shared/functionsClient";

export interface ProblemSummary {
  problemId: string;
  title: string;
  description: string;
  initialCode: string;
  pointsTotal: number;
}

export type ParticipantStatus = "IN_PROGRESS" | "SUBMITTED" | "FINALIZED";

export interface GradedProblemResult {
  status: "AC" | "WA" | "CE" | "NOT_ATTEMPTED";
  score: number;
  maxScore: number;
  compileErrorMessage: string | null;
  tcResults: TestCaseResult[];
}

export interface EnterQuizResponse {
  participantStatus: ParticipantStatus;
  problems: ProblemSummary[];
  /** 퀴즈 전체(모든 문항 합산) 연습 실행 한도와 남은 횟수 */
  maxRuns: number;
  remainingRuns: number;
  startAt: number;
  endAt: number;
  quizTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  // 입장 시점의 서버 시각(ms) — 기기 시계 오차를 보정하는 데 쓴다(shared/serverClock.ts).
  serverNow: number;
  // 응시 화면 코드 에디터에서 복사·붙여넣기를 막을지(부정행위 방지) — CEditor.tsx.
  clipboardRestricted: boolean;
  // 화면 이탈 감지(2단계 경고 + 서버 기록) 사용 여부 — useFocusGuard.ts.
  focusGuardEnabled: boolean;
  // 교사의 "테스트용 수강생" 참가자 여부 — 참이면 QuizTaking.tsx가 마감시각 경과에
  // 따른 화면 잠금(readOnly/버튼 비활성화)을 걸지 않는다.
  isTestEntry: boolean;
  // 제출완료/채점완료 상태로 (재)입장했을 때만 채워진다 — 응시 화면 그대로의 모습으로
  // "제출했던 코드"와 "테스트케이스 결과"를 복기할 수 있게 하기 위함(ResultView).
  existingSubmission?: Record<string, { code: string; submittedAt?: number }>;
  gradedResult?: Record<string, GradedProblemResult>;
}

export function enterQuiz(input: {
  quizId: string;
  accessCode: string;
  // Classroom 연동 퀴즈는 로그인 이메일로 명부에서 신원을 바로 찾으므로 보내지 않는다
  // (QuizEntry.tsx, functions/src/callable/enterQuiz.ts).
  studentId?: string;
  name?: string;
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
  points: number;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  memo?: string;
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

export function reportFocusLoss(input: { quizId: string; durationMs: number }) {
  return callFunction<typeof input, { recorded: boolean }>("reportFocusLoss", input);
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
  status: "AC" | "WA" | "CE" | "NOT_ATTEMPTED";
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
