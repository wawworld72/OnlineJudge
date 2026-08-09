---

description: "Task list template for feature implementation"
---

# Tasks: C언어 온라인 저지 퀴즈 시스템

**Input**: Design documents from `/specs/001-c-quiz-judge-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (모두 존재)

**Tests**: 사용자 요청으로 테스트 태스크를 포함한다. 각 User Story마다 contracts/
callable-functions.md의 해당 엔드포인트에 대한 계약 테스트와, quickstart.md 시나리오를 그대로
옮긴 통합 테스트를 구현 이전에 배치했다(TDD) — **먼저 테스트를 작성하고 실패하는 것을 확인한
뒤 구현을 진행한다.** Firestore 보안 규칙 전체 매트릭스 검증, App Check 강제 검증, 순수 유틸
단위 테스트는 여러 스토리에 걸치므로 Polish 단계에 남겨둔다.

**참고**: 설계 리뷰(2026-08-09)를 반영해 태스크 ID를 T001부터 다시 부여했다(구현이 아직
시작되지 않아 재번호에 따른 손실이 없음). 주요 변경: 실행 횟수 카운터·제출·채점 결과는
`participants` 문서의 map 필드로 통합했고(서브컬렉션 폐지), 테스트케이스는
`quizzes/{quizId}/problemSecrets/{problemId}.items` 배열 필드로 통합했다(구 `testCases`
서브컬렉션 폐지, 문항 공개 문서와는 절대 합치지 않음). App Check와 Zod 런타임 검증이
Foundational 단계에 추가됐다.

**Organization**: User Story별로 그룹화(spec.md의 P1~P6). 각 스토리는 독립적으로 구현·검증
가능하다(다른 스토리의 UI 없이도 Firestore 시드 데이터로 검증 가능 — quickstart.md 참고).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 미완료 작업에 의존하지 않음)
- **[Story]**: 해당 태스크가 속한 User Story(US1~US6)
- 파일 경로는 plan.md의 Project Structure(`functions/`, `web/`)를 따른다.

---

## Phase 1: Setup (공용 인프라)

**Purpose**: 프로젝트 초기화

- [X] T001 plan.md 구조대로 `functions/`, `web/`, `firebase.json`, `firestore.rules`,
  `firestore.indexes.json` 뼈대 생성
- [X] T002 `functions/`에 TypeScript Cloud Functions 프로젝트 초기화(`package.json`,
  `tsconfig.json`, `firebase-admin`/`firebase-functions`/`googleapis`/`zod` 의존성 +
  Vitest, `firebase-functions-test`, `@firebase/rules-unit-testing` 개발 의존성)
- [X] T003 [P] `web/`에 Vite + React 프로젝트 초기화(`package.json`, `tsconfig.json`,
  `vite.config.ts`, Firebase JS SDK + `firebase/app-check` 의존성)
- [X] T004 [P] `functions/`와 `web/`에 ESLint/Prettier 설정
- [X] T005 [P] `web/`에 CodeMirror 6 + `@codemirror/lang-cpp` 설치 및 기본 에디터 래퍼
  `web/src/editor/CEditor.tsx` 생성
- [X] T006 `firebase.json`에 Emulator Suite(auth, firestore, functions) 설정 및
  `npm run emulators`/`npm test`(에뮬레이터 기동 후 Vitest 실행) 스크립트 추가

**Checkpoint**: 빈 프로젝트가 빌드/에뮬레이터 기동까지 성공하는 상태

---

## Phase 2: Foundational (모든 User Story의 선행 조건)

**Purpose**: 모든 User Story가 공통으로 의존하는 핵심 인프라. 이 단계 완료 전에는 어떤
User Story도 시작할 수 없다.

**⚠️ CRITICAL**: 이 단계의 신원 검증·서버 신뢰 경계·App Check·런타임 검증 유틸은 헌법 원칙
I·II·III을 실제로 구현하는 지점이므로 모든 학생/교사 Callable Function이 반드시 이를 통과해야
한다.

**⚠️ 모듈 경계 규칙(research.md §16, SC-001~003)**: `googleapis`를 임포트하는 코드
(`classroomClient.ts`, `sheetsClient.ts`와 이를 호출하는 Classroom/Sheets Callable
Function)는 학생용 함수(`enterQuiz`/`practiceRun`/`finalSubmit`/`getMyResult`)나 이 단계의
공용 모듈에서 절대 임포트하지 않는다 — 콜드 스타트 번들 크기가 커지면 SC-001(1초)/SC-002
(2초) 목표를 첫 요청에서 넘기기 쉽다.

- [ ] T007 `firestore.rules`에 기본 거부(default-deny) 규칙 골격 작성. `problemSecrets`/
  `participants`/`students`/`rosters`/`accessLogs`/`archives`는 예외 없이 전면 차단(참가자
  데이터는 `enterQuiz`/`practiceRun`/`finalSubmit`/`getMyResult` 응답으로만 전달 — "조회
  경로 단일화"를 학생에게도 동일 적용). `quizzes`/`problems`의 조건부 read 허용은 T038(US1)에서
  자신의 경로 줄로 추가
- [ ] T008 [P] `functions/src/models/types.ts`에 data-model.md의 모든 엔티티 타입 정의
  (Quiz(`deletedAt` 없음, 퀴즈 자체는 소프트삭제 대상 아님), Problem(`deletedAt`),
  ProblemSecrets(`items: TestCase[]`), StudentRosterEntry, Roster,
  Participant(`runsUsedByProblem`/`submissions`/`runResults` map 필드 포함), AccessLog
  (`expiresAt`), ArchiveExport)
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
- [ ] T015 [P] `functions/src/shared/schemas.ts`에 모든 Callable Function 요청과 Firestore
  쓰기 대상 객체에 대한 Zod 스키마 정의(research.md §7 — Firestore는 스키마를 강제하지
  않으므로 `finalStatus` 등 열거형 값의 실제 강제는 이 스키마가 런타임에 담당)
- [ ] T016 `functions/src/shared/callableFactory.ts`에 모든 Callable Function이 공유하는
  생성 헬퍼 구현 — `enforceAppCheck: true`를 기본 적용하고, 핸들러 실행 전 T015의 Zod 스키마로
  입력을 검증한 뒤 실패 시 T013 오류 헬퍼로 응답(research.md §6~7)
- [ ] T017 [P] `web/src/shared/Login.tsx`에 Firebase Authentication Google 로그인 + 허용
  도메인 검사 구현(FR-002)
- [ ] T018 [P] `web/src/shared/functionsClient.ts`에 Callable Functions 공용 호출 래퍼 구현
- [ ] T019 [P] `web/src/shared/countdown.ts`에 서버가 준 종료시각 기준 로컬 카운트다운 유틸
  구현(`onSnapshot` 미사용, 헌법 IV·VII)
- [ ] T020 [P] `web/src/shared/DelayedActionButton.tsx`에 단계적 지연 안내 UX 컴포넌트
  구현(진행중→지연안내→재시도, FR-035, 헌법 V·VI)
- [ ] T021 [P] `web/src/shared/appCheck.ts`에 App Check 클라이언트 초기화 구현
  (`ReCaptchaV3Provider` + 로컬 개발/Emulator용 디버그 토큰 분기, research.md §6) — 앱 부팅
  시 T018의 Callable Function 클라이언트보다 먼저 초기화되어야 함
- [ ] T022 `web/src/App.tsx`에 로그인 이메일 기준 학생/교사 역할 라우팅 구현
- [ ] T023 `firestore.indexes.json`에 `participants` 컬렉션의 `(quizId ASC, finalSubmittedAt
  ASC)` 복합 인덱스를 정의(data-model.md "필요한 복합 인덱스" 참고 — 이 조합만 실제로 필요)

**Checkpoint**: 이 지점부터 모든 User Story를 (병렬로도) 시작할 수 있다

---

## Phase 3: User Story 1 - 학생의 퀴즈 응시 (Priority: P1) 🎯 MVP

**Goal**: 학생이 입장(참가자 문서 생성) → 연습 실행(횟수 제한·비공개 TC 마스킹·캐시 재사용) →
최종 제출까지 전체 흐름을 완료한다.

**Independent Test**: Firestore에 문항·`problemSecrets`가 준비된 `OPEN` 퀴즈를 시드해두고,
학생 1명이 입장·연습 실행·최종 제출을 완료해 참가자 상태가 "제출됨"이 되는 것으로 검증
(quickstart.md User Story 1 절 참고).

### Tests for User Story 1 ⚠️

> **먼저 작성하고 구현 전에 실패를 확인한다.**

- [ ] T024 [P] [US1] Contract test for `enterQuiz`(출입코드/학번·이름·이메일 불일치 시 거부,
  이메일 미등록 시 `NEEDS_EMAIL_REGISTRATION`, 성공 시 `participants` 문서가 `runsUsedByProblem
  /submissions/runResults: {}`로 생성되는지) in `functions/test/contract/enterQuiz.spec.ts`
- [ ] T025 [P] [US1] Contract test for `registerStudentEmail`(FR-011~012 중복/도용 방지) in
  `functions/test/contract/registerStudentEmail.spec.ts`
- [ ] T026 [P] [US1] Contract test for `practiceRun`(횟수 소진 거부, 비공개 TC 마스킹, 캐시
  재사용 시 횟수 미차감, 동시(`Promise.all`) 호출 시에도 `runsUsedByProblem`이 한도를 넘지
  않는지) in `functions/test/contract/practiceRun.spec.ts`
- [ ] T027 [P] [US1] Contract test for `finalSubmit`(제출 후 재제출 시 기존 결과 반환, 종료
  시각 이후 거부, `submissions` map이 한 번의 업데이트로 기록되는지) in
  `functions/test/contract/finalSubmit.spec.ts`
- [ ] T028 [P] [US1] Contract test for `getMyResult`(FINALIZED 이전엔 점수 미노출) in
  `functions/test/contract/getMyResult.spec.ts`
- [ ] T029 [US1] Integration test — 입장(참가자 문서 생성 확인)→연습실행(캐시 재사용 포함)→
  최종제출 전체 흐름을 Firebase Emulator로 실행(quickstart.md User Story 1 시나리오 그대로) in
  `functions/test/integration/studentQuizFlow.spec.ts`

### Implementation for User Story 1

- [ ] T030 [P] [US1] `functions/src/callable/enterQuiz.ts`에 `enterQuiz` 구현(FR-009~011,
  T009/T010/T011 유틸 사용, T016 팩토리로 생성). 검증 통과 시 `participants` 문서가 없으면
  `finalStatus: 'IN_PROGRESS'`와 빈 map 필드들로 생성(research.md §10) — T024 통과
- [ ] T031 [P] [US1] `functions/src/callable/registerStudentEmail.ts`에
  `registerStudentEmail` 구현(FR-011~012) — T025 통과
- [ ] T032 [US1] `functions/src/services/graderClient.ts`에 Grader `/grade` 호출 클라이언트
  구현(contracts/grader-api.md, T012 재시도 래퍼 사용). 테스트케이스는
  `quizzes/{quizId}/problemSecrets/{problemId}.items`를 1회 읽어 구성
- [ ] T033 [US1] `functions/src/services/practiceRunCache.ts`에 연습 실행 결과 캐시 구현
  (FR-016, research.md §13 — 캐시 키: quizId+problemId+code+`problems.updatedAt`, TTL 5분,
  `SYSTEM_ERROR`는 캐시 제외. TTL은 성능 파라미터일 뿐이고 정확성은 키에 포함된 `updatedAt`이
  보장함을 유의)
- [ ] T034 [US1] `functions/src/services/runCountTransaction.ts`에 실행 횟수 원자적
  확인·차감 구현(FR-014) — `participants/{quizId}_{studentId}` 문서를 `runTransaction`으로 읽어
  `runsUsedByProblem.{problemId} < maxRuns`일 때만 1 증가시켜 커밋
  (`FieldValue.increment()` 단독 사용은 조건부 거부가 안 되므로 쓰지 않음, research.md §5)
- [ ] T035 [US1] `functions/src/callable/practiceRun.ts`에 `practiceRun` 구현(T032, T033,
  T034 통합 + 비공개 TC 마스킹, FR-013~016) — T026 통과
- [ ] T036 [US1] `functions/src/callable/finalSubmit.ts`에 `finalSubmit` 구현(FR-017~019,
  FR-032, FR-036 — 서버 시각 재검증, 장애로 인한 자동 연장 없음). 문항별 코드를
  `participants.submissions` map 필드에 트랜잭션으로 한 번에 기록하고 `finalStatus`를
  `'SUBMITTED'`로 갱신 — T027 통과
- [ ] T037 [P] [US1] `functions/src/callable/getMyResult.ts`에 `getMyResult` 구현(FR-024,
  참가자 문서의 `runResults` map 필드를 그대로 반환) — T028 통과
- [ ] T038 [P] [US1] `firestore.rules`에 `quizzes`/`problems`(OPEN 상태 + `deletedAt == null`,
  정답 없는 필드) 읽기 허용 규칙 추가(자신의 경로 줄만 추가, T007이 만든 다른 줄은 수정하지
  않음). `participants`는 T007에서 이미 전면 차단됨(직접 읽기 경로 불필요)
- [ ] T039 [P] [US1] `web/src/student/QuizList.tsx`에 퀴즈 목록 화면 구현(OPEN 퀴즈만, 딥링크
  지원)
- [ ] T040 [US1] `web/src/student/QuizEntry.tsx`에 입장 화면 구현(출입코드·학번·이름 입력,
  T020 지연 UX, 이메일 최초 등록 플로우)
- [ ] T041 [US1] `web/src/student/QuizTaking.tsx`에 문항 탭 + 코드 에디터(T005) + 실행/제출
  + 카운트다운(T019) 화면 구현
- [ ] T042 [US1] `web/src/student/FinalSubmitModal.tsx`에 최종 제출 확인 모달 구현(T020
  지연 UX, 문항별 작성 상태 요약)
- [ ] T043 [US1] `web/src/student/ResultView.tsx`에 제출 완료 후 화면(SUBMITTED/FINALIZED
  상태별 안내, FR-024) 구현 — T029 통과

**Checkpoint**: User Story 1이 단독으로 완전히 동작하고 검증 가능하다(MVP)

---

## Phase 4: User Story 2 - 교사의 퀴즈·문항 준비 및 배포 전 점검 (Priority: P2)

**Goal**: 교사가 퀴즈·문항·테스트케이스를 만들고 배포 전 점검을 통과시켜 퀴즈를 공개한다.

**Independent Test**: 새 퀴즈에 문항 1개·테스트케이스 1개 이상을 입력하고 배포 전 점검에서
차단 항목 없음을 확인한 뒤 공개 상태로 전환(quickstart.md User Story 2 절 참고).

### Tests for User Story 2 ⚠️

- [ ] T044 [P] [US2] Contract test for `upsertQuiz`(FR-003, 생성 시 DRAFT 상태 강제) in
  `functions/test/contract/upsertQuiz.spec.ts`
- [ ] T045 [P] [US2] Contract test for `upsertProblem`/`deleteProblem`(FR-004, 생성 시
  `pointsTotal: 0` 초기화, 메타데이터만 수정할 때는 `pointsTotal`/`updatedAt`이 변하지 않는지,
  `deleteProblem`은 문서를 지우지 않고 `deletedAt`만 설정하는지) in
  `functions/test/contract/problems.spec.ts`
- [ ] T046 [P] [US2] Contract test for `upsertTestCase`/`deleteTestCase`(FR-005~006,
  `problemSecrets.items` 배열이 트랜잭션으로 갱신되는지, **같은 트랜잭션에서**
  `problems.pointsTotal`과 `problems.updatedAt`도 함께 갱신되는지, **동시성 테스트**: 같은
  문항에 서로 다른 테스트케이스를 동시에(`Promise.all`) `upsertTestCase`하면 두 수정이 모두
  최종 `items`/`pointsTotal`에 반영되는지(lost-update 없음, contracts/callable-functions.md
  "동시 편집 안전성" 참고)) in
  `functions/test/contract/testCases.spec.ts`
- [ ] T047 [P] [US2] Contract test for `runPreDeployCheck`(FR-007, 각 판정 항목별 PASS/WARN/
  BLOCK, 데이터 미변경, 분반 연동 시 `classroomRosterSync`/`classroomDeployment`가 항상
  WARN 이하로만 판정되는지 — 절대 BLOCK이 아님을 확인) in
  `functions/test/contract/runPreDeployCheck.spec.ts`
- [ ] T048 [P] [US2] Contract test for `setQuizStatus`(FR-008, 차단 항목 있으면 OPEN 거부) in
  `functions/test/contract/setQuizStatus.spec.ts`
- [ ] T049 [US2] Integration test — 퀴즈 생성→문항/테스트케이스 입력→배포전점검→공개 전환
  흐름(quickstart.md User Story 2 시나리오) in
  `functions/test/integration/teacherQuizPrep.spec.ts`

### Implementation for User Story 2

- [ ] T050 [P] [US2] `functions/src/callable/upsertQuiz.ts`에 퀴즈 생성/수정 구현(FR-003) —
  T044 통과
- [ ] T051 [P] [US2] `functions/src/callable/problems.ts`에 `upsertProblem`/`deleteProblem`
  구현(FR-004). `upsertProblem`은 문항 메타데이터(제목·설명·초기코드·maxRuns)만 다루며,
  신규 생성 시에만 `pointsTotal: 0`으로 초기화하고 이후 메타데이터 수정 시에는
  `pointsTotal`/`updatedAt`을 건드리지 않는다(그 둘의 소유자는 T052뿐 — data-model.md
  "pointsTotal/updatedAt의 소유권" 참고). `deleteProblem`은 하드 삭제가 아니라 `deletedAt`을
  현재 서버 시각으로 설정하는 소프트 삭제다 — Firestore에는 캐스케이드 삭제가 없어 하드
  삭제하면 `problemSecrets`가 고아로 남기 때문(data-model.md) — T045 통과
- [ ] T052 [P] [US2] `functions/src/callable/testCases.ts`에 `upsertTestCase`/
  `deleteTestCase` 구현(FR-005~006). Request는 테스트케이스 1개 단위의 델타만 받는다
  (`items` 전체 배열이나 배점 합계는 클라이언트가 보내지 않음). 하나의 Firestore 트랜잭션
  안에서 `tx.get()`으로 `problemSecrets.items`를 **그 시점에 다시 읽고**, 그 배열에 델타를
  적용한 뒤 배점 합을 재계산해 `problemSecrets.items`/`updatedAt`과
  `problems.pointsTotal`/`updatedAt`을 함께 쓴다 — 클라이언트가 계산한 배열/합계를 그대로
  믿지 않고 항상 트랜잭션 내부 재조회 값을 기준으로 계산해야, 같은 문항을 두 탭에서 동시에
  편집해도 Firestore의 트랜잭션 자동 재시도로 두 수정 모두 최종 합계에 반영된다(lost-update
  방지, contracts/callable-functions.md 참고). 두 문서를 별도 쓰기로 나누면 캐시 무효화가
  누락될 수 있음(data-model.md 참고) — T046 통과
- [ ] T053 [US2] `functions/src/callable/runPreDeployCheck.ts`에 `runPreDeployCheck`
  구현(FR-007, 데이터 변경 없이 판정만, `deletedAt != null`인 문항은 판정 대상에서 제외).
  분반이 연동된 경우 `classroomRosterSync`(수강생 명단 동기화 여부)와
  `classroomDeployment`(`courseWorkId` 존재 여부) 두 항목을 WARN 이하로만 추가 —
  T047 통과
- [ ] T054 [US2] `functions/src/callable/setQuizStatus.ts`에 `setQuizStatus` 구현(FR-008,
  차단 항목이 있으면 `OPEN` 전환 거부) — T048 통과
- [ ] T055 [P] [US2] `firestore.rules`에 `quizzes`/`problems`/`problemSecrets` 클라이언트
  write 전면 차단이 이미 걸려 있는지 확인하고 누락된 경로 보강
- [ ] T056 [P] [US2] `web/src/teacher/QuizManager.tsx`에 교사 퀴즈 목록/생성/수정/상태전환
  화면 구현
- [ ] T057 [US2] `web/src/teacher/ProblemEditor.tsx`에 문항·테스트케이스 편집 화면 구현
  (Markdown 설명, 배점 합계 자동 표시, 삭제된(`deletedAt != null`) 문항은 목록에서 숨김)
- [ ] T058 [US2] `web/src/teacher/PreDeployCheck.tsx`에 배포 전 점검 결과 패널(PASS/WARN/
  BLOCK, `classroomRosterSync`/`classroomDeployment` WARN 항목 포함) 구현 — T049 통과

**Checkpoint**: User Story 1과 2가 함께, 각각 독립적으로 동작한다

---

## Phase 5: User Story 3 - 교사의 제출물 일괄 채점 및 점수 확정 (Priority: P3)

**Goal**: 교사가 제출된 모든 학생의 코드를 일괄 채점하고 점수를 확정한다.

**Independent Test**: 제출완료/미제출/이미확정 상태가 섞인 참가자들에 대해 일괄 채점을
실행해 처리/스킵/실패 인원 요약을 확인(quickstart.md User Story 3 절 참고).

### Tests for User Story 3 ⚠️

- [ ] T059 [P] [US3] Contract test for `batchGrade`(FR-020~023, FINALIZED 스킵, 미제출 문항
  NOT_ATTEMPTED 0점 처리, `runResults` map이 참가자 문서 1건 업데이트로 기록되는지,
  분반 연동 + 성적 미반영 상태에서 `classroomGradesPending: true`가 반환되는지) in
  `functions/test/contract/batchGrade.spec.ts`
- [ ] T060 [US3] Integration test — 제출완료/미제출/이미확정 참가자가 섞인 퀴즈에서 일괄
  채점 실행 후 처리/스킵/실패 집계 확인(quickstart.md User Story 3 시나리오) in
  `functions/test/integration/batchGrade.spec.ts`

### Implementation for User Story 3

- [ ] T061 [US3] `functions/src/callable/batchGrade.ts`에 `batchGrade` 구현(FR-020~023,
  T032 Grader 클라이언트 재사용, research.md §15). `participants`에서 `quizId == X &&
  finalStatus == 'SUBMITTED'`로 조회(등호 필터만 조합이라 복합 인덱스 불필요), 대상 참가자를
  동시성 상한(잠정 10)을 둔 청크로 나눠 처리하고, Cloud Functions 2세대 `timeoutSeconds`를
  540으로 설정한다(100명×문항5개=최대 500회 Grader 호출이 기본 타임아웃을 넘기지 않도록).
  참가자별로 `runResults` map 필드와 `finalTotal`/`finalStatus: 'FINALIZED'`를 한 번의 문서
  업데이트로 기록. 응답 전 `quizzes.courseId` 존재 + `FINALIZED` 참가자 중 `pushGrades` 미실행
  인원 존재 여부를 확인해 `classroomGradesPending`을 채운다(FR-023 WARN 안내) — T059 통과
- [ ] T062 [P] [US3] `functions/src/services/scoreAggregation.ts`에 문항 배점 기준 총점
  재계산 유틸 구현(헌법 I — Grader가 준 score를 그대로 신뢰하지 않고 서버가 재계산)
- [ ] T063 [P] [US3] `web/src/teacher/BatchGrade.tsx`에 일괄 채점 실행 버튼 + 결과 요약
  팝업(처리/스킵/실패 인원, `classroomGradesPending`이면 성적 반영 미실행 경고 배너) 구현 —
  T060 통과

**Checkpoint**: User Story 1~3이 함께, 각각 독립적으로 동작한다

---

## Phase 6: User Story 4 - 교사의 참가자 현황 조회 (Priority: P4)

**Goal**: 교사가 퀴즈별 전체 대상 학생의 응시 상태와 점수를 조회한다.

**Independent Test**: 응시 상태가 서로 다른 학생들이 포함된 퀴즈에서 참가자 현황을 조회해
상태·제출시각·확정점수가 목록으로 나오는지 확인(quickstart.md User Story 4 절 참고).

### Tests for User Story 4 ⚠️

- [ ] T064 [P] [US4] Contract test for `getParticipantOverview`(FR-025, 전체 대상 학생 상태
  표시, `quizId ==` + `finalSubmittedAt` 정렬 쿼리가 T023 복합 인덱스로 동작하는지) in
  `functions/test/contract/getParticipantOverview.spec.ts`
- [ ] T065 [P] [US4] Contract test for `getParticipantDetail`(FR-025, 참가자 문서 1건에서
  `submissions`/`runResults` map을 그대로 반환하는지) in
  `functions/test/contract/getParticipantDetail.spec.ts`
- [ ] T066 [US4] Integration test — 상태가 서로 다른 학생들이 섞인 퀴즈에서 현황 조회→상세
  열람 흐름(quickstart.md User Story 4 시나리오) in
  `functions/test/integration/participantStatus.spec.ts`

### Implementation for User Story 4

- [ ] T067 [P] [US4] `functions/src/callable/getParticipantOverview.ts`에
  `getParticipantOverview` 구현(FR-025, `quizId ==` + `finalSubmittedAt` 정렬 쿼리) —
  T064 통과
- [ ] T068 [P] [US4] `functions/src/callable/getParticipantDetail.ts`에
  `getParticipantDetail` 구현(FR-025, 참가자 문서 1건 읽기) — T065 통과
- [ ] T069 [US4] `web/src/teacher/ParticipantStatus.tsx`에 참가자 현황 목록 + 상세 열람
  화면 구현 — T066 통과

**Checkpoint**: User Story 1~4가 함께, 각각 독립적으로 동작한다

---

## Phase 7: User Story 5 - 교사의 Google Classroom 연동 (Priority: P5, 필수)

**Goal**: 교사가 매 퀴즈 운영 사이클마다 Classroom 수강생 동기화·과제 배포·성적 반영을
수행한다(선택 기능이 아니라 필수 — Classroom 미연동 분반/퀴즈는 정상 운영 대상이 아니다).

**Independent Test**: Classroom과 연동된 분반에서 수강생 동기화 → 과제 배포 → 성적 반영을
각각 실행해 결과 요약을 확인(quickstart.md User Story 5 절 참고, googleapis는 모킹).

### Tests for User Story 5 ⚠️

- [ ] T070 [P] [US5] Contract test for `syncRoster`(FR-026~027, 학번 추출 불가 계정 건너뛰기
  집계, googleapis 모킹) in `functions/test/contract/syncRoster.spec.ts`
- [ ] T071 [P] [US5] Contract test for `deployClassroomAssignment`/
  `resetClassroomDeployment`(FR-028~029, 중복 배포 차단) in
  `functions/test/contract/classroomAssignment.spec.ts`
- [ ] T072 [P] [US5] Contract test for `pushGrades`(FR-030~031, 확정 참가자 없을 시
  `NO_FINALIZED_PARTICIPANTS`, 연결 끊김 학생 스킵+사유 기록) in
  `functions/test/contract/pushGrades.spec.ts`
- [ ] T073 [US5] Integration test — 수강생 동기화→과제 배포→성적 반영 전체 흐름(모킹된
  Classroom API, quickstart.md User Story 5 시나리오) in
  `functions/test/integration/classroomFlow.spec.ts`

### Implementation for User Story 5

- [ ] T074 [P] [US5] `functions/src/services/classroomClient.ts`에 Google Classroom API
  클라이언트 구현(googleapis, T012 재시도 래퍼 사용)
- [ ] T075 [US5] `functions/src/callable/syncRoster.ts`에 `syncRoster` 구현(FR-026~027) —
  T070 통과
- [ ] T076 [US5] `functions/src/callable/classroomAssignment.ts`에
  `deployClassroomAssignment`/`resetClassroomDeployment` 구현(FR-028~029, 중복 배포 차단) —
  T071 통과
- [ ] T077 [US5] `functions/src/callable/pushGrades.ts`에 `pushGrades` 구현(FR-030~031) —
  T072 통과
- [ ] T078 [US5] `web/src/teacher/ClassroomPanel.tsx`에 동기화/배포/성적반영 버튼과 결과
  팝업 화면 구현 — T073 통과

**Checkpoint**: User Story 1~5가 함께, 각각 독립적으로 동작한다(US5의 구현·테스트는 다른
스토리를 기술적으로 막지 않지만, 완성된 시스템에서는 반드시 사용되는 필수 기능이다)

---

## Phase 8: User Story 6 - 교사의 퀴즈 데이터 아카이브 및 삭제 (Priority: P6)

**Goal**: 교사가 퀴즈 데이터를 탭별로 구분된 Google 스프레드시트로 아카이브한 뒤 삭제한다.

**Independent Test**: 채점이 확정된 퀴즈에서 아카이브 내보내기 실행 후 삭제를 실행해 데이터
제거를 확인, 아카이브 없이 삭제 시 경고가 뜨는지 확인(quickstart.md User Story 6 절 참고).

### Tests for User Story 6 ⚠️

- [ ] T079 [P] [US6] Contract test for `archiveQuiz`(FR-037~038, 생성된 시트에 4개 탭이
  각각 기록되는지 — 참가자 map 필드에서 데이터를 모아 시트로 옮기는 부분 포함, googleapis
  Sheets 모킹) in `functions/test/contract/archiveQuiz.spec.ts`
- [ ] T080 [P] [US6] Contract test for `deleteQuizData`(FR-039~040, 아카이브 미존재 시
  `NOT_ARCHIVED_YET`, `confirmWithoutArchive: true`로 강행 가능) in
  `functions/test/contract/deleteQuizData.spec.ts`
- [ ] T081 [US6] Integration test — 아카이브 없이 삭제 시도(거부)→아카이브 실행→삭제 실행→
  데이터 조회 시 존재하지 않음 확인(quickstart.md User Story 6 시나리오) in
  `functions/test/integration/archiveAndDelete.spec.ts`

### Implementation for User Story 6

- [ ] T082 [P] [US6] `functions/src/services/sheetsClient.ts`에 Google Sheets API 클라이언트
  구현(googleapis, T012 재시도 래퍼 사용, 탭별 쓰기)
- [ ] T083 [US6] `functions/src/callable/archiveQuiz.ts`에 `archiveQuiz` 구현(FR-037~038,
  4개 탭: 퀴즈 개요/참가자 및 확정 점수/문항별 채점 결과/제출 코드 — 참가자 문서의
  `submissions`/`runResults` map을 순회해 행으로 펼침) — T079 통과
- [ ] T084 [US6] `functions/src/callable/deleteQuizData.ts`에 `deleteQuizData` 구현
  (FR-039~040, 아카이브 미존재 시 `NOT_ARCHIVED_YET` 경고 후 명시적 확인 필요) — T080 통과
- [ ] T085 [US6] `web/src/teacher/ArchiveDelete.tsx`에 아카이브/삭제 버튼과 미아카이브 경고
  확인 다이얼로그 구현 — T081 통과

**Checkpoint**: 모든 User Story가 함께, 각각 독립적으로 동작한다

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 여러 User Story에 걸친 검증 및 마무리

- [ ] T086 [P] `functions/test/rules.spec.ts`에 `@firebase/rules-unit-testing`으로 전체
  컬렉션 접근 규칙 매트릭스(contracts/firestore-access-summary.md 표 전체) 검증 작성 —
  `problemSecrets` 전면 차단, `participants` 문서 read 전면 거부(본인 포함) 검증 포함
- [ ] T087 [P] `functions/test/unit/`에 identity, timeAuthority, scoreAggregation,
  runCountTransaction 유틸 Vitest 단위 테스트 작성(경합 상황 시뮬레이션 포함, FR-014 —
  동시에 여러 `runTransaction` 호출을 걸어 `runsUsedByProblem`이 한도를 넘지 않는지 검증)
- [ ] T088 [P] `functions/test/contract/appCheck.spec.ts`에 App Check 토큰 없이 Callable
  Function을 호출하면 거부되는지, 유효한 디버그 토큰으로는 통과하는지 검증(research.md §6)
- [ ] T089 `functions/scripts/seed.ts`에 quickstart.md 시드 데이터 스크립트 작성
- [ ] T090 quickstart.md의 User Story 1~6 검증 시나리오를 Emulator Suite에서 전체 실행하고
  결과 기록
- [ ] T091 `accessLogs.expiresAt` 필드에 Firestore TTL 정책(6개월)을 Firebase CLI/console로
  설정하고 설정 방법을 `functions/README.md` 또는 배포 문서에 기록(research.md §8)
- [ ] T092 100명/문항 5개 기준 실제 Firestore 읽기·쓰기 횟수를 에뮬레이터 로그로 추정해
  헌법 원칙 IV(Spark 무료 한도) 대비 여유율 재확인(map 필드 통합 이후 참가자 조회가 11회 →
  1회로 줄어든 효과를 실측치로 반영)
- [ ] T093 `batchGrade`의 SC-004(100명 규모) 실측 검증 — (실제 또는 스텁) Grader 서버로
  참가자 100명(문항 5개, 스킵/실패 없는 최악 케이스)을 시드해 `batchGrade`를 1회 실행하고
  실제 소요 시간을 기록한다. T061의 동시성 상한(잠정 10)·`timeoutSeconds`(잠정 540)가 실측
  Grader 응답 시간 기준으로 충분한지 확인하고, 부족하면 research.md §15의 잠정값을 실측
  근거로 갱신한다(SC-004는 이 실측 없이는 충족 여부를 확인할 수 없음 — 설계 문서 검토만으로
  닫을 수 있는 항목이 아니다)
- [ ] T094 SC-001~003(응답 시간 목표) 실측 검증 — **실제 Firebase 프로젝트에 배포한 뒤**
  (Emulator Suite 측정치는 콜드 스타트·네트워크 지연을 반영하지 않아 하한선일 뿐이므로 제외)
  `enterQuiz`(SC-001, 목표 2초)·`practiceRun`(SC-002, 목표 3초)·`finalSubmit`(SC-003, 목표
  3초)·퀴즈 목록 조회(목표 1초)를 각각 콜드 스타트 1회 + 웜 상태 반복 요청 5회씩 측정해
  기록한다. 콜드 스타트가 목표를 크게 넘기면 research.md §16의 모듈 경계 분리(T032/T074가
  실제로 `googleapis`를 분리했는지)를 다시 확인한다

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
- **US3(P3)**: `graderClient`(T032, US1에서 생성)를 재사용하므로 T032 완료 후 시작하는 것을
  권장하지만, 별도 Grader 클라이언트를 임시로 두면 이론상 독립 시작도 가능
- **US4(P4)**: Foundational 이후 시작 가능, 다른 스토리와 무관(조회 전용). T023의 복합 인덱스가
  없으면 `getParticipantOverview`가 실패하므로 Foundational 완료가 특히 중요
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
- Foundational의 `[P]` 태스크(T008~T013, T015, T017~T021) 병렬 가능(T016은 T015에 의존,
  T023은 스키마 확정 후 단독 진행)
- 각 User Story의 계약 테스트(`[P]` 표시)는 서로 다른 파일이므로 전부 병렬 작성 가능
- Foundational 완료 후 US1~US6를 인력이 있으면 동시에 진행 가능
- 같은 스토리 내에서도 `[P]` 표시된 태스크는 병렬 가능(예: T050~T052)

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
2. Phase 2: Foundational 완료 (모든 스토리를 막는 필수 조건 — App Check/Zod/복합 인덱스 포함)
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

**`firestore.rules` 공유 규칙**: T007(Foundational)이 이 파일의 골격(기본 거부 + 최초 예외
목록)을 만든다. 이후 T038(US1)·T055(US2)를 포함해 이 파일을 다루는 모든 태스크는 **자신의
컬렉션 경로에 해당하는 줄만 추가**하며, 다른 태스크가 이미 추가한 줄을 삭제하거나 고치지
않는다. 여러 담당자가 US1/US2를 동시에 진행해도 각자 다른 줄에 추가만 하면 git이 자동으로
병합할 수 있어 충돌이 거의 발생하지 않는다 — 기존 줄을 정리·재구성하고 싶다면 별도 태스크로
분리해 한 사람이 전담한다.

---

## Notes

- `[P]` 태스크 = 다른 파일, 의존성 없음
- `[Story]` 라벨은 추적을 위해 각 태스크를 User Story에 매핑한다
- 각 User Story는 독립적으로 완료·검증 가능해야 한다(quickstart.md가 그 기준)
- 각 스토리의 테스트는 구현보다 먼저 작성하고, 구현 전에 반드시 실패하는 것을 확인한다(TDD)
- 논리적 작업 단위마다 커밋
- 모든 체크포인트에서 멈춰 해당 스토리를 독립적으로 검증할 수 있다
- 지양할 것: 모호한 태스크, 같은 파일에 대한 충돌, 스토리 간 독립성을 깨는 교차 의존
