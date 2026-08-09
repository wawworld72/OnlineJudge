---

description: "Task list template for feature implementation"
---

# Tasks: C언어 온라인 저지 퀴즈 시스템

**Input**: Design documents from `/specs/001-c-quiz-judge-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (모두 존재)

**Tests**: 사용자 요청으로 테스트 태스크를 포함한다. 각 User Story마다 contracts/
callable-functions.md의 해당 엔드포인트에 대한 계약 테스트와, quickstart.md 시나리오를 그대로
옮긴 통합 테스트를 구현 이전에 배치했다(TDD) — **먼저 테스트를 작성하고 실패하는 것을 확인한
뒤 구현을 진행한다.** Firestore 보안 규칙 전체 매트릭스 검증과 순수 유틸 단위 테스트는 여러
스토리에 걸치므로 Polish 단계에 남겨둔다.

**Organization**: User Story별로 그룹화(spec.md의 P1~P6). 각 스토리는 독립적으로 구현·검증
가능하다(다른 스토리의 UI 없이도 Firestore 시드 데이터로 검증 가능 — quickstart.md 참고).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 미완료 작업에 의존하지 않음)
- **[Story]**: 해당 태스크가 속한 User Story(US1~US6)
- 파일 경로는 plan.md의 Project Structure(`functions/`, `web/`)를 따른다.

---

## Phase 1: Setup (공용 인프라)

**Purpose**: 프로젝트 초기화

- [ ] T001 plan.md 구조대로 `functions/`, `web/`, `firebase.json`, `firestore.rules`,
  `firestore.indexes.json` 뼈대 생성
- [ ] T002 `functions/`에 TypeScript Cloud Functions 프로젝트 초기화(`package.json`,
  `tsconfig.json`, `firebase-admin`/`firebase-functions`/`googleapis` 의존성 +
  Vitest, `firebase-functions-test`, `@firebase/rules-unit-testing` 개발 의존성)
- [ ] T003 [P] `web/`에 Vite + React 프로젝트 초기화(`package.json`, `tsconfig.json`,
  `vite.config.ts`, Firebase JS SDK 의존성)
- [ ] T004 [P] `functions/`와 `web/`에 ESLint/Prettier 설정
- [ ] T005 [P] `web/`에 CodeMirror 6 + `@codemirror/lang-cpp` 설치 및 기본 에디터 래퍼
  `web/src/editor/CEditor.tsx` 생성
- [ ] T006 `firebase.json`에 Emulator Suite(auth, firestore, functions) 설정 및
  `npm run emulators`/`npm test`(에뮬레이터 기동 후 Vitest 실행) 스크립트 추가

**Checkpoint**: 빈 프로젝트가 빌드/에뮬레이터 기동까지 성공하는 상태

---

## Phase 2: Foundational (모든 User Story의 선행 조건)

**Purpose**: 모든 User Story가 공통으로 의존하는 핵심 인프라. 이 단계 완료 전에는 어떤
User Story도 시작할 수 없다.

**⚠️ CRITICAL**: 이 단계의 신원 검증·서버 신뢰 경계 유틸은 헌법 원칙 I·II·III을 실제로
구현하는 지점이므로 모든 학생/교사 Callable Function이 반드시 이를 통과해야 한다.

- [ ] T007 `firestore.rules`에 기본 거부(default-deny) 규칙과 contracts/
  firestore-access-summary.md의 허용 예외(퀴즈/문항 OPEN 시 읽기, 본인 participants 문서
  읽기)를 작성
- [ ] T008 [P] `functions/src/models/types.ts`에 data-model.md의 모든 엔티티 타입 정의
  (Quiz, Problem, TestCase, StudentRosterEntry, Roster, Participant, Submission, RunResult,
  AccessLog, ArchiveExport)
- [ ] T009 [P] `functions/src/shared/identity.ts`에 학번+이름+이메일 3중 대조 유틸 구현
  (FR-009~012, 헌법 II)
- [ ] T010 [P] `functions/src/shared/participantId.ts`에 참가자 문서ID 재계산 유틸 구현
  (`${quizId}_${studentId}`, 헌법 I — 클라이언트가 보낸 값은 신뢰하지 않고 항상 재계산)
- [ ] T011 [P] `functions/src/shared/timeAuthority.ts`에 서버 기준 시각 판단 유틸 구현
  (헌법 VII, `Timestamp.now()` 기준 응시 가능/마감 판단)
- [ ] T012 [P] `functions/src/shared/retryOnce.ts`에 외부 호출 1회 재시도 래퍼 구현(헌법 VI —
  Grader/Classroom/Sheets 클라이언트가 공통으로 사용)
- [ ] T013 [P] `functions/src/shared/errors.ts`에 표준 오류 응답 헬퍼 구현(사용자용 일반
  안내 + 서버 로그 상세 기록, 헌법 VI)
- [ ] T014 `functions/src/config.ts`에 환경 변수 로더 구현(`GRADER_SERVICE_URL`,
  `GRADER_AUTH_TOKEN`, 허용 이메일 도메인)
- [ ] T015 [P] `web/src/shared/Login.tsx`에 Firebase Authentication Google 로그인 + 허용
  도메인 검사 구현(FR-002)
- [ ] T016 [P] `web/src/shared/functionsClient.ts`에 Callable Functions 공용 호출 래퍼 구현
- [ ] T017 [P] `web/src/shared/countdown.ts`에 서버가 준 종료시각 기준 로컬 카운트다운 유틸
  구현(`onSnapshot` 미사용, 헌법 IV·VII)
- [ ] T018 [P] `web/src/shared/DelayedActionButton.tsx`에 단계적 지연 안내 UX 컴포넌트
  구현(진행중→지연안내→재시도, FR-035, 헌법 V·VI)
- [ ] T019 `web/src/App.tsx`에 로그인 이메일 기준 학생/교사 역할 라우팅 구현

**Checkpoint**: 이 지점부터 모든 User Story를 (병렬로도) 시작할 수 있다

---

## Phase 3: User Story 1 - 학생의 퀴즈 응시 (Priority: P1) 🎯 MVP

**Goal**: 학생이 입장 → 연습 실행(횟수 제한·비공개 TC 마스킹·캐시 재사용) → 최종 제출까지
전체 흐름을 완료한다.

**Independent Test**: Firestore에 문항·테스트케이스가 준비된 `OPEN` 퀴즈를 시드해두고, 학생
1명이 입장·연습 실행·최종 제출을 완료해 참가자 상태가 "제출됨"이 되는 것으로 검증
(quickstart.md User Story 1 절 참고).

### Tests for User Story 1 ⚠️

> **먼저 작성하고 구현 전에 실패를 확인한다.**

- [ ] T020 [P] [US1] Contract test for `enterQuiz`(출입코드/학번·이름·이메일 불일치 시 거부,
  이메일 미등록 시 `NEEDS_EMAIL_REGISTRATION`) in `functions/test/contract/enterQuiz.spec.ts`
- [ ] T021 [P] [US1] Contract test for `registerStudentEmail`(FR-011~012 중복/도용 방지) in
  `functions/test/contract/registerStudentEmail.spec.ts`
- [ ] T022 [P] [US1] Contract test for `practiceRun`(횟수 소진 거부, 비공개 TC 마스킹, 캐시
  재사용 시 횟수 미차감) in `functions/test/contract/practiceRun.spec.ts`
- [ ] T023 [P] [US1] Contract test for `finalSubmit`(제출 후 재제출 시 기존 결과 반환, 종료
  시각 이후 거부) in `functions/test/contract/finalSubmit.spec.ts`
- [ ] T024 [P] [US1] Contract test for `getMyResult`(FINALIZED 이전엔 점수 미노출) in
  `functions/test/contract/getMyResult.spec.ts`
- [ ] T025 [US1] Integration test — 입장→연습실행(캐시 재사용 포함)→최종제출 전체 흐름을
  Firebase Emulator로 실행(quickstart.md User Story 1 시나리오 그대로) in
  `functions/test/integration/studentQuizFlow.spec.ts`

### Implementation for User Story 1

- [ ] T026 [P] [US1] `functions/src/callable/enterQuiz.ts`에 `enterQuiz` 구현(FR-009~011,
  T009/T010/T011 유틸 사용) — T020 통과
- [ ] T027 [P] [US1] `functions/src/callable/registerStudentEmail.ts`에
  `registerStudentEmail` 구현(FR-011~012) — T021 통과
- [ ] T028 [US1] `functions/src/services/graderClient.ts`에 Grader `/grade` 호출 클라이언트
  구현(contracts/grader-api.md, T012 재시도 래퍼 사용)
- [ ] T029 [US1] `functions/src/services/practiceRunCache.ts`에 연습 실행 결과 캐시 구현
  (FR-016, 캐시 키: quizId+problemId+code+문항 updatedAt, `SYSTEM_ERROR`는 캐시 제외)
- [ ] T030 [US1] `functions/src/services/runCountTransaction.ts`에 실행 횟수 원자적
  확인·차감 구현(FR-014, Firestore `runTransaction`, 경합 상황에서도 한도 초과 금지)
- [ ] T031 [US1] `functions/src/callable/practiceRun.ts`에 `practiceRun` 구현(T028, T029,
  T030 통합 + 비공개 TC 마스킹, FR-013~016) — T022 통과
- [ ] T032 [US1] `functions/src/callable/finalSubmit.ts`에 `finalSubmit` 구현(FR-017~019,
  FR-032, FR-036 — 서버 시각 재검증, 장애로 인한 자동 연장 없음) — T023 통과
- [ ] T033 [P] [US1] `functions/src/callable/getMyResult.ts`에 `getMyResult` 구현(FR-024) —
  T024 통과
- [ ] T034 [P] [US1] `firestore.rules`에 `quizzes`/`problems`(OPEN 상태만, 정답 없는 필드)
  읽기 허용과 `participants`/`submissions`/`runResults` 본인 문서 읽기 허용 규칙 추가
  (`testCases`는 T007에서 이미 전면 차단됨)
- [ ] T035 [P] [US1] `web/src/student/QuizList.tsx`에 퀴즈 목록 화면 구현(OPEN 퀴즈만, 딥링크
  지원)
- [ ] T036 [US1] `web/src/student/QuizEntry.tsx`에 입장 화면 구현(출입코드·학번·이름 입력,
  T018 지연 UX, 이메일 최초 등록 플로우)
- [ ] T037 [US1] `web/src/student/QuizTaking.tsx`에 문항 탭 + 코드 에디터(T005) + 실행/제출
  + 카운트다운(T017) 화면 구현
- [ ] T038 [US1] `web/src/student/FinalSubmitModal.tsx`에 최종 제출 확인 모달 구현(T018
  지연 UX, 문항별 작성 상태 요약)
- [ ] T039 [US1] `web/src/student/ResultView.tsx`에 제출 완료 후 화면(SUBMITTED/FINALIZED
  상태별 안내, FR-024) 구현 — T025 통과

**Checkpoint**: User Story 1이 단독으로 완전히 동작하고 검증 가능하다(MVP)

---

## Phase 4: User Story 2 - 교사의 퀴즈·문항 준비 및 배포 전 점검 (Priority: P2)

**Goal**: 교사가 퀴즈·문항·테스트케이스를 만들고 배포 전 점검을 통과시켜 퀴즈를 공개한다.

**Independent Test**: 새 퀴즈에 문항 1개·테스트케이스 1개 이상을 입력하고 배포 전 점검에서
차단 항목 없음을 확인한 뒤 공개 상태로 전환(quickstart.md User Story 2 절 참고).

### Tests for User Story 2 ⚠️

- [ ] T040 [P] [US2] Contract test for `upsertQuiz`(FR-003, 생성 시 DRAFT 상태 강제) in
  `functions/test/contract/upsertQuiz.spec.ts`
- [ ] T041 [P] [US2] Contract test for `upsertProblem`/`deleteProblem`(FR-004, 저장 시
  `pointsTotal` 재계산) in `functions/test/contract/problems.spec.ts`
- [ ] T042 [P] [US2] Contract test for `upsertTestCase`/`deleteTestCase`(FR-005~006) in
  `functions/test/contract/testCases.spec.ts`
- [ ] T043 [P] [US2] Contract test for `runPreDeployCheck`(FR-007, 각 판정 항목별 PASS/WARN/
  BLOCK, 데이터 미변경) in `functions/test/contract/runPreDeployCheck.spec.ts`
- [ ] T044 [P] [US2] Contract test for `setQuizStatus`(FR-008, 차단 항목 있으면 OPEN 거부) in
  `functions/test/contract/setQuizStatus.spec.ts`
- [ ] T045 [US2] Integration test — 퀴즈 생성→문항/테스트케이스 입력→배포전점검→공개 전환
  흐름(quickstart.md User Story 2 시나리오) in
  `functions/test/integration/teacherQuizPrep.spec.ts`

### Implementation for User Story 2

- [ ] T046 [P] [US2] `functions/src/callable/upsertQuiz.ts`에 퀴즈 생성/수정 구현(FR-003) —
  T040 통과
- [ ] T047 [P] [US2] `functions/src/callable/problems.ts`에 `upsertProblem`/`deleteProblem`
  구현(FR-004, 저장 시 `pointsTotal` 재계산) — T041 통과
- [ ] T048 [P] [US2] `functions/src/callable/testCases.ts`에 `upsertTestCase`/
  `deleteTestCase` 구현(FR-005~006) — T042 통과
- [ ] T049 [US2] `functions/src/callable/runPreDeployCheck.ts`에 `runPreDeployCheck`
  구현(FR-007, 데이터 변경 없이 판정만) — T043 통과
- [ ] T050 [US2] `functions/src/callable/setQuizStatus.ts`에 `setQuizStatus` 구현(FR-008,
  차단 항목이 있으면 `OPEN` 전환 거부) — T044 통과
- [ ] T051 [P] [US2] `firestore.rules`에 `quizzes`/`problems`/`testCases` 클라이언트 write
  전면 차단이 이미 걸려 있는지 확인하고 누락된 경로 보강
- [ ] T052 [P] [US2] `web/src/teacher/QuizManager.tsx`에 교사 퀴즈 목록/생성/수정/상태전환
  화면 구현
- [ ] T053 [US2] `web/src/teacher/ProblemEditor.tsx`에 문항·테스트케이스 편집 화면 구현
  (Markdown 설명, 배점 합계 자동 표시)
- [ ] T054 [US2] `web/src/teacher/PreDeployCheck.tsx`에 배포 전 점검 결과 패널(PASS/WARN/
  BLOCK) 구현 — T045 통과

**Checkpoint**: User Story 1과 2가 함께, 각각 독립적으로 동작한다

---

## Phase 5: User Story 3 - 교사의 제출물 일괄 채점 및 점수 확정 (Priority: P3)

**Goal**: 교사가 제출된 모든 학생의 코드를 일괄 채점하고 점수를 확정한다.

**Independent Test**: 제출완료/미제출/이미확정 상태가 섞인 참가자들에 대해 일괄 채점을
실행해 처리/스킵/실패 인원 요약을 확인(quickstart.md User Story 3 절 참고).

### Tests for User Story 3 ⚠️

- [ ] T055 [P] [US3] Contract test for `batchGrade`(FR-020~023, FINALIZED 스킵, 미제출 문항
  NOT_ATTEMPTED 0점 처리) in `functions/test/contract/batchGrade.spec.ts`
- [ ] T056 [US3] Integration test — 제출완료/미제출/이미확정 참가자가 섞인 퀴즈에서 일괄
  채점 실행 후 처리/스킵/실패 집계 확인(quickstart.md User Story 3 시나리오) in
  `functions/test/integration/batchGrade.spec.ts`

### Implementation for User Story 3

- [ ] T057 [US3] `functions/src/callable/batchGrade.ts`에 `batchGrade` 구현(FR-020~023,
  T028 Grader 클라이언트 재사용, `FINALIZED` 스킵) — T055 통과
- [ ] T058 [P] [US3] `functions/src/services/scoreAggregation.ts`에 문항 배점 기준 총점
  재계산 유틸 구현(헌법 I — Grader가 준 score를 그대로 신뢰하지 않고 서버가 재계산)
- [ ] T059 [P] [US3] `web/src/teacher/BatchGrade.tsx`에 일괄 채점 실행 버튼 + 결과 요약
  팝업(처리/스킵/실패 인원) 구현 — T056 통과

**Checkpoint**: User Story 1~3이 함께, 각각 독립적으로 동작한다

---

## Phase 6: User Story 4 - 교사의 참가자 현황 조회 (Priority: P4)

**Goal**: 교사가 퀴즈별 전체 대상 학생의 응시 상태와 점수를 조회한다.

**Independent Test**: 응시 상태가 서로 다른 학생들이 포함된 퀴즈에서 참가자 현황을 조회해
상태·제출시각·확정점수가 목록으로 나오는지 확인(quickstart.md User Story 4 절 참고).

### Tests for User Story 4 ⚠️

- [ ] T060 [P] [US4] Contract test for `getParticipantOverview`(FR-025, 전체 대상 학생 상태
  표시) in `functions/test/contract/getParticipantOverview.spec.ts`
- [ ] T061 [P] [US4] Contract test for `getParticipantDetail`(FR-025, 제출 코드·채점 상세) in
  `functions/test/contract/getParticipantDetail.spec.ts`
- [ ] T062 [US4] Integration test — 상태가 서로 다른 학생들이 섞인 퀴즈에서 현황 조회→상세
  열람 흐름(quickstart.md User Story 4 시나리오) in
  `functions/test/integration/participantStatus.spec.ts`

### Implementation for User Story 4

- [ ] T063 [P] [US4] `functions/src/callable/getParticipantOverview.ts`에
  `getParticipantOverview` 구현(FR-025) — T060 통과
- [ ] T064 [P] [US4] `functions/src/callable/getParticipantDetail.ts`에
  `getParticipantDetail` 구현(FR-025) — T061 통과
- [ ] T065 [US4] `web/src/teacher/ParticipantStatus.tsx`에 참가자 현황 목록 + 상세 열람
  화면 구현 — T062 통과

**Checkpoint**: User Story 1~4가 함께, 각각 독립적으로 동작한다

---

## Phase 7: User Story 5 - 교사의 Google Classroom 연동 (Priority: P5, 필수)

**Goal**: 교사가 매 퀴즈 운영 사이클마다 Classroom 수강생 동기화·과제 배포·성적 반영을
수행한다(선택 기능이 아니라 필수 — Classroom 미연동 분반/퀴즈는 정상 운영 대상이 아니다).

**Independent Test**: Classroom과 연동된 분반에서 수강생 동기화 → 과제 배포 → 성적 반영을
각각 실행해 결과 요약을 확인(quickstart.md User Story 5 절 참고, googleapis는 모킹).

### Tests for User Story 5 ⚠️

- [ ] T066 [P] [US5] Contract test for `syncRoster`(FR-026~027, 학번 추출 불가 계정 건너뛰기
  집계, googleapis 모킹) in `functions/test/contract/syncRoster.spec.ts`
- [ ] T067 [P] [US5] Contract test for `deployClassroomAssignment`/
  `resetClassroomDeployment`(FR-028~029, 중복 배포 차단) in
  `functions/test/contract/classroomAssignment.spec.ts`
- [ ] T068 [P] [US5] Contract test for `pushGrades`(FR-030~031, 확정 참가자 없을 시
  `NO_FINALIZED_PARTICIPANTS`, 연결 끊김 학생 스킵+사유 기록) in
  `functions/test/contract/pushGrades.spec.ts`
- [ ] T069 [US5] Integration test — 수강생 동기화→과제 배포→성적 반영 전체 흐름(모킹된
  Classroom API, quickstart.md User Story 5 시나리오) in
  `functions/test/integration/classroomFlow.spec.ts`

### Implementation for User Story 5

- [ ] T070 [P] [US5] `functions/src/services/classroomClient.ts`에 Google Classroom API
  클라이언트 구현(googleapis, T012 재시도 래퍼 사용)
- [ ] T071 [US5] `functions/src/callable/syncRoster.ts`에 `syncRoster` 구현(FR-026~027) —
  T066 통과
- [ ] T072 [US5] `functions/src/callable/classroomAssignment.ts`에
  `deployClassroomAssignment`/`resetClassroomDeployment` 구현(FR-028~029, 중복 배포 차단) —
  T067 통과
- [ ] T073 [US5] `functions/src/callable/pushGrades.ts`에 `pushGrades` 구현(FR-030~031) —
  T068 통과
- [ ] T074 [US5] `web/src/teacher/ClassroomPanel.tsx`에 동기화/배포/성적반영 버튼과 결과
  팝업 화면 구현 — T069 통과

**Checkpoint**: User Story 1~5가 함께, 각각 독립적으로 동작한다(US5의 구현·테스트는 다른
스토리를 기술적으로 막지 않지만, 완성된 시스템에서는 반드시 사용되는 필수 기능이다)

---

## Phase 8: User Story 6 - 교사의 퀴즈 데이터 아카이브 및 삭제 (Priority: P6)

**Goal**: 교사가 퀴즈 데이터를 탭별로 구분된 Google 스프레드시트로 아카이브한 뒤 삭제한다.

**Independent Test**: 채점이 확정된 퀴즈에서 아카이브 내보내기 실행 후 삭제를 실행해 데이터
제거를 확인, 아카이브 없이 삭제 시 경고가 뜨는지 확인(quickstart.md User Story 6 절 참고).

### Tests for User Story 6 ⚠️

- [ ] T075 [P] [US6] Contract test for `archiveQuiz`(FR-037~038, 생성된 시트에 4개 탭이
  각각 기록되는지, googleapis Sheets 모킹) in `functions/test/contract/archiveQuiz.spec.ts`
- [ ] T076 [P] [US6] Contract test for `deleteQuizData`(FR-039~040, 아카이브 미존재 시
  `NOT_ARCHIVED_YET`, `confirmWithoutArchive: true`로 강행 가능) in
  `functions/test/contract/deleteQuizData.spec.ts`
- [ ] T077 [US6] Integration test — 아카이브 없이 삭제 시도(거부)→아카이브 실행→삭제 실행→
  데이터 조회 시 존재하지 않음 확인(quickstart.md User Story 6 시나리오) in
  `functions/test/integration/archiveAndDelete.spec.ts`

### Implementation for User Story 6

- [ ] T078 [P] [US6] `functions/src/services/sheetsClient.ts`에 Google Sheets API 클라이언트
  구현(googleapis, T012 재시도 래퍼 사용, 탭별 쓰기)
- [ ] T079 [US6] `functions/src/callable/archiveQuiz.ts`에 `archiveQuiz` 구현(FR-037~038,
  4개 탭: 퀴즈 개요/참가자 및 확정 점수/문항별 채점 결과/제출 코드) — T075 통과
- [ ] T080 [US6] `functions/src/callable/deleteQuizData.ts`에 `deleteQuizData` 구현
  (FR-039~040, 아카이브 미존재 시 `NOT_ARCHIVED_YET` 경고 후 명시적 확인 필요) — T076 통과
- [ ] T081 [US6] `web/src/teacher/ArchiveDelete.tsx`에 아카이브/삭제 버튼과 미아카이브 경고
  확인 다이얼로그 구현 — T077 통과

**Checkpoint**: 모든 User Story가 함께, 각각 독립적으로 동작한다

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 여러 User Story에 걸친 검증 및 마무리

- [ ] T082 [P] `functions/test/rules.spec.ts`에 `@firebase/rules-unit-testing`으로 전체
  컬렉션 접근 규칙 매트릭스(contracts/firestore-access-summary.md 표 전체) 검증 작성 —
  `testCases` 전면 차단, 타인 `participants` 문서 read 거부 포함
- [ ] T083 [P] `functions/test/unit/`에 identity, timeAuthority, scoreAggregation,
  runCountTransaction 유틸 Vitest 단위 테스트 작성(경합 상황 시뮬레이션 포함, FR-014)
- [ ] T084 `functions/scripts/seed.ts`에 quickstart.md 시드 데이터 스크립트 작성
- [ ] T085 quickstart.md의 User Story 1~6 검증 시나리오를 Emulator Suite에서 전체 실행하고
  결과 기록
- [ ] T086 100명/문항 5개 기준 실제 Firestore 읽기·쓰기 횟수를 에뮬레이터 로그로 추정해
  헌법 원칙 IV(Spark 무료 한도) 대비 여유율 재확인

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존성 없음 — 즉시 시작
- **Foundational (Phase 2)**: Setup 완료 후 — 모든 User Story를 막는 선행 조건
- **User Stories (Phase 3~8)**: 전부 Foundational 완료에 의존. 이후 우선순위 순서(P1→P6)로
  순차 진행하거나, 인력이 있으면 병렬 진행 가능(각 스토리는 독립적으로 테스트 가능하도록
  설계됨)
- **Polish (Phase 9)**: 구현하기로 한 모든 User Story 완료에 의존

### User Story Dependencies

- **US1(P1)**: Foundational 이후 시작 가능, 다른 스토리에 의존하지 않음(퀴즈/문항은 시드
  데이터로 대체)
- **US2(P2)**: Foundational 이후 시작 가능. US1과 데이터를 공유하지만(같은 퀴즈) 독립적으로
  테스트 가능
- **US3(P3)**: `graderClient`(T028, US1에서 생성)를 재사용하므로 T028 완료 후 시작하는 것을
  권장하지만, 별도 Grader 클라이언트를 임시로 두면 이론상 독립 시작도 가능
- **US4(P4)**: Foundational 이후 시작 가능, 다른 스토리와 무관(조회 전용)
- **US5(P5)**: Foundational 이후 시작 가능, 필수 기능이지만 구현·테스트는 다른 스토리를
  기술적으로 막지 않음(독립적으로 개발 가능)
- **US6(P6)**: Foundational 이후 시작 가능, 다른 스토리에 영향 없음(단, 실제 검증은 US3에서
  확정 채점된 데이터가 있어야 의미가 있음)

### Within Each User Story

- 테스트(계약 테스트 → 통합 테스트) 작성 및 실패 확인 → 서비스/유틸 → Callable Function →
  화면 순서로 구현. 각 구현 태스크는 대응하는 테스트 태스크를 통과시키는 것을 완료 기준으로
  삼는다
- 여러 Callable Function이 같은 서비스(예: `graderClient`)를 공유하면 그 서비스부터 구현
- 스토리 완료 후 다음 우선순위로 이동

### Parallel Opportunities

- Setup의 `[P]` 태스크(T003~T005) 병렬 가능
- Foundational의 `[P]` 태스크(T008~T013, T015~T018) 병렬 가능
- 각 User Story의 계약 테스트(`[P]` 표시)는 서로 다른 파일이므로 전부 병렬 작성 가능
- Foundational 완료 후 US1~US6를 인력이 있으면 동시에 진행 가능
- 같은 스토리 내에서도 `[P]` 표시된 태스크는 병렬 가능(예: T046~T048)

---

## Parallel Example: User Story 1

```bash
# Foundational 완료 후, US1의 계약 테스트를 먼저 병렬로 작성:
Task: "Contract test for enterQuiz in functions/test/contract/enterQuiz.spec.ts"
Task: "Contract test for registerStudentEmail in functions/test/contract/registerStudentEmail.spec.ts"
Task: "Contract test for practiceRun in functions/test/contract/practiceRun.spec.ts"
Task: "Contract test for finalSubmit in functions/test/contract/finalSubmit.spec.ts"
Task: "Contract test for getMyResult in functions/test/contract/getMyResult.spec.ts"

# 테스트가 실패하는 것을 확인한 뒤, 독립 파일 구현 작업을 병렬로 진행:
Task: "functions/src/callable/enterQuiz.ts에 enterQuiz 구현"
Task: "functions/src/callable/registerStudentEmail.ts에 registerStudentEmail 구현"
Task: "web/src/student/QuizList.tsx에 퀴즈 목록 화면 구현"
```

---

## Implementation Strategy

### MVP First (User Story 1만)

1. Phase 1: Setup 완료
2. Phase 2: Foundational 완료 (모든 스토리를 막는 필수 조건)
3. Phase 3: User Story 1의 테스트 작성 → 실패 확인 → 구현 → 테스트 통과
4. **STOP and VALIDATE**: quickstart.md User Story 1 절로 독립 검증
5. 준비되면 배포/시연 (교사가 Firestore 콘솔로 퀴즈를 수동 등록해도 학생 응시 흐름 시연 가능)

### Incremental Delivery

1. Setup + Foundational → 기반 완료
2. US1 추가(테스트 → 구현) → 독립 검증 → 시연(MVP)
3. US2 추가(교사가 UI로 퀴즈를 직접 준비 가능해짐) → 독립 검증 → 시연
4. US3 추가(일괄 채점) → 독립 검증 → 시연 — 여기까지가 "핵심 응시 사이클" 완성
5. US5(Classroom 연동, **필수**) 추가 → 독립 검증 → 시연 — 이 단계가 끝나야 실제 운영(수강생
   동기화·과제 배포·성적 반영) 가능한 시스템으로 간주한다
6. US4(참가자 현황 조회)·US6(아카이브/삭제)는 운영 편의 기능으로 필요한 순서대로 추가

### Parallel Team Strategy

인력이 여러 명이면 Foundational 완료 후 US1(학생 응시)/US2(교사 준비)/US4(현황 조회)를
서로 다른 담당자가 동시에 진행할 수 있다. US3(일괄 채점)은 US1의 `graderClient`를
재사용하므로 US1 담당자와의 조율이 필요하다. US5·US6은 독립적이라 언제든 별도로 진행 가능.

---

## Notes

- `[P]` 태스크 = 다른 파일, 의존성 없음
- `[Story]` 라벨은 추적을 위해 각 태스크를 User Story에 매핑한다
- 각 User Story는 독립적으로 완료·검증 가능해야 한다(quickstart.md가 그 기준)
- 각 스토리의 테스트는 구현보다 먼저 작성하고, 구현 전에 반드시 실패하는 것을 확인한다(TDD)
- 논리적 작업 단위마다 커밋
- 모든 체크포인트에서 멈춰 해당 스토리를 독립적으로 검증할 수 있다
- 지양할 것: 모호한 태스크, 같은 파일에 대한 충돌, 스토리 간 독립성을 깨는 교차 의존
