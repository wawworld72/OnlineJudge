import type { Timestamp } from "firebase-admin/firestore";

export type StudentStatus = "ACTIVE" | "INACTIVE";

export interface Student {
  name: string;
  email: string | null;
  status: StudentStatus;
}

export interface Roster {
  courseId: string;
  courseName: string;
  studentId: string;
  name: string;
  email: string;
  syncedAt: Timestamp;
}

export type QuizStatus = "DRAFT" | "OPEN" | "CLOSED";

export interface Quiz {
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

export type RunStatus = "AC" | "WA" | "CE" | "RE" | "TLE" | "MLE";

export interface TestCaseResult {
  tcId: string;
  status: RunStatus;
  isPublic: boolean;
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
  completedCount: number;
  totalCount: number;
  runsUsedByProblem: Record<string, number>;
  submissions: Record<string, Submission>;
  runResults: Record<string, RunResult>;
}

export interface AccessLog {
  participantId: string;
  action: string;
  timestamp: Timestamp;
  userAgent: string;
  expiresAt: Timestamp;
}

export interface ArchiveExport {
  quizId: string;
  createdAt: Timestamp;
  spreadsheetUrl: string;
  createdBy: string;
}
