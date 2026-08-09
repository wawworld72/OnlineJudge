# Quickstart: C언어 온라인 저지 퀴즈 시스템 검증 가이드

각 User Story의 Independent Test(spec.md)를 Firebase Emulator Suite로 실제 실행해 확인하는
절차다. 구현 코드는 포함하지 않으며, 명령·시나리오·기대 결과만 기술한다.

## 사전 준비

```bash
firebase emulators:start --only auth,firestore,functions
```

- 시드 스크립트(구현 단계에서 `functions/scripts/seed.ts` 등으로 작성)로 아래 최소 데이터를
  Firestore 에뮬레이터에 넣는다:
  - `students/S001` (`name: "홍길동"`, `email: null`, `status: 'ACTIVE'`)
  - `quizzes/Q1` (`status: 'DRAFT'`, `accessCode: 'ABCD'`, `maxRunsPerProblem: 10`, 응시 기간은
    현재 시각 기준 시작 전~1시간 뒤)
  - `quizzes/Q1/problems/P1` + `quizzes/Q1/problemSecrets/P1.items = [TC1(공개), TC2(비공개)]`
- Grader 호출은 에뮬레이터 환경에서 로컬 스텁 서버(고정 응답 반환)로 대체한다.

## User Story 2 검증 — 퀴즈 준비 및 배포 전 점검 (P2)

1. `upsertProblem`, `upsertTestCase`로 P1에 문항/테스트케이스가 있는 상태 확인.
2. `runPreDeployCheck({quizId: 'Q1'})` 호출 → `blockingCount === 0` 기대(출입코드·기간·문항·
   테스트케이스가 모두 준비됐으므로).
3. `setQuizStatus({quizId: 'Q1', status: 'OPEN'})` 호출 → 성공, `quizzes/Q1.status === 'OPEN'`.

## User Story 1 검증 — 학생 응시 전체 흐름 (P1)

1. Auth 에뮬레이터에 `student1@hoseo.edu`로 로그인한 컨텍스트에서 `enterQuiz({quizId: 'Q1',
   accessCode: 'ABCD', studentId: 'S001', name: '홍길동'})` 호출.
   - 이메일 미등록 상태이므로 `NEEDS_EMAIL_REGISTRATION` 오류 기대 → `registerStudentEmail`
     호출 후 `enterQuiz` 재호출 → 문항 목록 응답 확인.
2. `practiceRun({quizId:'Q1', problemId:'P1', code: '<정답 코드>'})` 호출 →
   `remainingRuns === 9`, `tcResults`에서 비공개 TC2는 `input`/`expectedOutput` 없이 `passed`만
   있는지 확인.
3. 같은 `code`로 `practiceRun`을 다시 호출 → `usedCache: true`, `remainingRuns` 그대로 9(FR-016
   확인).
4. `maxRuns`(10)에 도달할 때까지 다른 코드로 반복 호출 → 11번째 호출에서 `NO_RUNS_LEFT` 오류
   확인(FR-014, 동시성 보장은 통합 테스트에서 병렬 호출로 별도 검증).
5. `finalSubmit({quizId:'Q1', submissions:[{problemId:'P1', code:'<최종 코드>'}]})` 호출 →
   `participantStatus: 'SUBMITTED'`.
6. 동일 `finalSubmit`을 다시 호출 → 새 저장 없이 같은 결과 반환 확인(FR-018).

## User Story 3 검증 — 일괄 채점 (P3)

1. 위 학생 제출 상태에서 `batchGrade({quizId:'Q1'})` 호출 → `processed: 1, skipped: 0`.
2. `getMyResult({quizId:'Q1'})`(학생 컨텍스트) 호출 → `participantStatus: 'FINALIZED'`와 문항별
   점수 확인.
3. `batchGrade`를 다시 호출 → 이번엔 `skipped: 1, processed: 0`(FR-021 확인).

## User Story 4 검증 — 참가자 현황 (P4)

1. 교사 컨텍스트에서 `getParticipantOverview({quizId:'Q1'})` 호출 → 대상 학생 명단(1명) 전원
   상태와 함께 표시되는지 확인.
2. `getParticipantDetail({quizId:'Q1', studentId:'S001'})` 호출 → 제출 코드·문항별 채점 상세
   확인.

## User Story 5 검증 — Classroom 연동 (P5, 필수)

Classroom API는 에뮬레이터가 없으므로 googleapis 클라이언트를 모킹한 통합 테스트로 대체한다.

1. `syncRoster({courseId:'C1'})`를 모킹된 Classroom 수강생 목록으로 호출 → 신규/갱신/건너뜀
   집계가 입력 데이터와 일치하는지 확인.
2. `deployClassroomAssignment({quizId:'Q1'})` 호출 → `courseWorkId` 저장 확인 → 동일 호출
   재실행 시 `ALREADY_DEPLOYED` 오류 확인(FR-029).
3. `pushGrades({quizId:'Q1'})`(FINALIZED 참가자 존재 상태) 호출 → `succeeded: 1`.

## User Story 6 검증 — 아카이브 및 삭제 (P6)

Google Sheets API도 모킹한다.

1. `deleteQuizData({quizId:'Q1'})`을 먼저 호출(아카이브 전) → `NOT_ARCHIVED_YET` 오류 확인
   (FR-040).
2. `archiveQuiz({quizId:'Q1'})` 호출 → `spreadsheetUrl` 반환, 모킹된 Sheets 클라이언트가
   4개 탭(퀴즈 개요/참가자 및 점수/채점 결과/제출 코드)에 대해 각각 1회 이상 쓰기 호출됐는지
   확인.
3. `deleteQuizData({quizId:'Q1'})` 재호출 → 성공, 이후 `getParticipantOverview({quizId:'Q1'})`
   호출 시 데이터가 존재하지 않는 것으로 처리되는지 확인.

## 회귀 확인 (헌법 원칙 매핑)

- Firestore 에뮬레이터의 보안 규칙 테스트(`@firebase/rules-unit-testing`)로 `problemSecrets`
  문서에 대한 클라이언트 SDK read/write가 모두 거부되는지 검증(헌법 III).
- 클라이언트 SDK로 `participants/{quizId}_{studentId}` 문서를 읽으려 하면(본인 문서 포함)
  항상 거부되는지 검증 — 참가자 데이터는 `enterQuiz`/`practiceRun`/`finalSubmit`/`getMyResult`
  응답으로만 전달된다(헌법 I·III).
- App Check 디버그 토큰 없이 Callable Function을 호출하면 거부되는지 확인(에뮬레이터에서 App
  Check 디버그 공급자를 켠 상태와 끈 상태를 각각 테스트, research.md §6).
- 같은 문항에 `practiceRun`을 동시에 여러 번(예: `Promise.all`로 5개) 호출해 남은 횟수가
  정확히 초과되지 않는지 확인(FR-014, research.md §5).
