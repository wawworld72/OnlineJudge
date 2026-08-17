import type { Timestamp } from "firebase-admin/firestore";

export type StudentStatus = "ACTIVE" | "INACTIVE";

export interface Student {
  name: string;
  email: string | null;
  status: StudentStatus;
}

export interface Roster {
  courseId: string;
  studentId: string;
  name: string;
  email: string;
  syncedAt: Timestamp;
}

export type QuizStatus = "DRAFT" | "OPEN" | "CLOSED";

export interface Quiz {
  /**
   * 사람이 관리하는 과목 구분용 이름(예: "컴퓨터프로그래밍심화(01분반)") — Classroom
   * `courseId`와 별개다. `exportGradesToSheet`가 이 값으로 같은 과목의 여러 퀴즈를
   * 한꺼번에 묶어 조회한다(Google Apps Script 연동, functions/src/services/gradeExport.ts).
   */
  subjectName: string;
  title: string;
  description: string;
  startAt: Timestamp;
  endAt: Timestamp;
  accessCode: string;
  status: QuizStatus;
  maxRunsPerProblem: number;
  courseId: string | null;
  courseWorkId: string | null;
  courseWorkLink: string | null;
  archivedAt: Timestamp | null;
  archiveSpreadsheetUrl: string | null;
  deletedAt: Timestamp | null;
}

export interface Problem {
  order: number;
  title: string;
  description: string;
  initialCode: string;
  maxRuns: number | null;
  pointsTotal: number;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface TestCase {
  tcId: string;
  tcNo: number;
  input: string;
  expected: string;
  points: number;
  isPublic: boolean;
  description: string;
}

export interface ProblemSecrets {
  items: TestCase[];
  updatedAt: Timestamp;
}

export type FinalStatus = "IN_PROGRESS" | "SUBMITTED" | "FINALIZED";

export interface Submission {
  code: string;
  submittedAt: Timestamp;
}

export type RunStatus = "AC" | "WA" | "CE" | "NOT_ATTEMPTED";

/**
 * `isPublic`이 false인 항목은 `input`/`expectedOutput`/`actualOutput`/`memo`를 제거하고
 * `passed`/`points`만 전달한다(contracts/grader-api.md "비공개 테스트케이스 처리", 헌법
 * III). `points`는 배점(정답 여부와 무관하게 항상 노출 — 정답 자체가 아니므로 안전하다).
 */
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

export interface RunResult {
  status: RunStatus;
  score: number;
  maxScore: number;
  compileErrorMessage: string | null;
  tcResults: TestCaseResult[];
}

export interface Participant {
  quizId: string;
  studentId: string;
  enteredAt: Timestamp;
  finalStatus: FinalStatus;
  finalSubmittedAt: Timestamp | null;
  finalTotal: number;
  runsUsedByProblem: Record<string, number>;
  submissions: Record<string, Submission>;
  runResults: Record<string, RunResult>;
  /**
   * `pushGrades`(User Story 5)가 이 참가자의 성적을 Classroom에 성공적으로 반영한
   * 시각. `batchGrade`가 `classroomGradesPending`을 판단할 때 이 필드로 "이미 반영된
   * FINALIZED 참가자"와 "아직 반영 안 된 FINALIZED 참가자"를 구분한다(research.md §19 —
   * data-model.md에 이 필드가 없어 발견된 누락).
   */
  gradePushedAt: Timestamp | null;
}

export interface AccessLog {
  participantId: string;
  action: string;
  timestamp: Timestamp;
  userAgent: string;
  expiresAt: Timestamp;
}
