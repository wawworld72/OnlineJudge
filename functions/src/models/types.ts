import type { Timestamp } from "firebase-admin/firestore";

export type StudentStatus = "ACTIVE" | "INACTIVE";

export interface Student {
  name: string;
  email: string | null;
  status: StudentStatus;
  /** 교사가 전역으로 한 번 등록한 테스트 계정이면 true(실제 학생이 아님).
   *  `enterQuiz.ts`가 이 이메일로 로그인하면 어떤 퀴즈든(Classroom 연동
   *  여부·분반과 무관) isTestEntry로 처리해 상태·시간·일시정지·마감·실행
   *  횟수 게이트를 모두 우회하게 한다. */
  isGlobalTestAccount?: boolean;
}

export interface Roster {
  courseId: string;
  studentId: string;
  name: string;
  email: string;
  syncedAt: Timestamp;
  /** (레거시) 과거 `addTestRosterEntry`가 만든 항목이면 true. 실제 `syncCourseRoster`가
   *  채운 항목은 false. 이 콜러블은 제거됐지만 이미 만들어진 항목은 계속 동작한다 —
   *  새 테스트 계정은 `Student.isGlobalTestAccount`로 등록한다. */
  isTestEntry: boolean;
}

export type QuizStatus = "DRAFT" | "OPEN" | "CLOSED";

/** 교사가 퀴즈 목록 화면의 "시작"으로 타이머를 처음 돌릴 때 쓰는 기본 길이(30분). */
export const DEFAULT_TIMER_DURATION_MS = 30 * 60 * 1000;

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
  /** 교사가 목록 화면에서 설정하는 타이머 길이. "시작"을 누르면
   *  endAt = 지금 + timerDurationMs로 계산하는 데 쓴다. */
  timerDurationMs: number;
  /** 일시정지 시각. null이면 실행 중이거나 아직 시작 전. "시작"(재개) 시
   *  멈춰있던 시간(now - pausedAt)만큼 endAt을 뒤로 늦추고 null로 되돌린다. */
  pausedAt: Timestamp | null;
  /** 교사가 켜면, 퀴즈가 CLOSED된 뒤 학생 본인 결과 화면에서 비공개
   *  테스트케이스의 input/expected까지 공개한다(getMyResult.ts). 기본 false —
   *  같은 문제를 다른 분반 퀴즈에 재사용 중이면 그 분반이 다 끝나기 전에는
   *  켜면 안 된다(교사가 직접 판단, 시스템이 감지하지 못함). */
  revealTestCases: boolean;
  /** 교사가 켜면 학생 응시 화면(QuizTaking)의 코드 에디터에서 붙여넣기(paste)·
   *  끌어다놓기(drop)·복사(copy)·잘라내기(cut)를 모두 막는다(부정행위 방지 —
   *  특히 문제/코드를 복사해 외부 AI 도구에 붙여넣는 경로 차단). 브라우저 JS
   *  차단이라 DevTools 등으로 우회 가능한 억제책일 뿐, 완전한 차단은 아니다.
   *  기본 false. 복기 화면(ResultView)에는 적용하지 않는다. */
  clipboardRestricted: boolean;
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
  /**
   * `enterQuiz`가 전역 테스트 계정(`Student.isGlobalTestAccount`, 레거시로는
   * `Roster.isTestEntry`)으로 입장시킨 참가자면 true. 퀴즈 상태·시작/종료
   * 시각·일시정지·실행 횟수 게이트(`enterQuiz`/`practiceRun`/`finalSubmit`)를
   * 우회하고, 참가자 현황·성적 반영·시트 내보내기에서는 자동으로
   * 제외된다(`participantOverview.ts`/`batchGrade.ts`).
   */
  isTestEntry: boolean;
}

export interface AccessLog {
  participantId: string;
  action: string;
  timestamp: Timestamp;
  userAgent: string;
  expiresAt: Timestamp;
}
