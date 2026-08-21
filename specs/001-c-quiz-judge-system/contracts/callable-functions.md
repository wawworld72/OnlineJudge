# Contract: Frontend ↔ Cloud Functions (Firebase Callable Functions)

모든 함수는 Firebase Callable Functions로 호출되며, `context.auth`(로그인 이메일)가 없으면
즉시 거부한다. 각 함수는 헌법 원칙 I·II에 따라 요청 파라미터(학번·이름·participantId 등)를
그대로 신뢰하지 않고 서버에서 재검증/재계산한다. 오류는 `{code, message}` 형태로 반환하며
`message`는 사용자에게 보여줄 일반 안내문(헌법 VI), 상세 원인은 Cloud Logging에만 남긴다.

모든 함수는 `enforceAppCheck: true`로 배포한다(research.md §6) — 로그인 여부와 무관하게, 실제
배포된 웹앱이 아닌 곳(예: 브라우저 콘솔에서 직접 호출)에서 온 요청은 이 계약에 도달하기 전에
거부된다. 모든 함수의 입력은 Zod 스키마로 런타임 검증한다(research.md §7). "교사용"으로
표시된 모든 함수는 추가로 `requireTeacher` 가드(로그인 이메일을 `TEACHER_EMAILS` 허용 목록과
대조)를 통과해야 한다(research.md §17).

## 학생용

### `enterQuiz`

- **Request**: `{ quizId: string, accessCode: string, studentId: string, name: string }`
- **처리**: FR-009~FR-011 순서로 검증(출입코드 → 퀴즈 상태/시간 → 학번·이름·이메일 3중 대조).
  이메일 미등록 학번이면 `NEEDS_EMAIL_REGISTRATION` 오류로 응답해 5.3절 플로우로 분기. 검증을
  통과하면 `participants/{quizId}_{studentId}` 문서가 없을 경우 이 시점에 생성한다
  (`finalStatus: 'IN_PROGRESS'`, `runsUsedByProblem/submissions/runResults: {}` — research.md
  §10, data-model.md). 이미 존재하면 그대로 조회만 한다.
- **Response**: `{ participantStatus, problems: [{problemId, title, description, initialCode, maxRuns, remainingRuns, pointsTotal}], endAt, existingSubmission?, gradedResult? }`
- **오류 코드**: `INVALID_ACCESS_CODE`, `IDENTITY_MISMATCH`, `QUIZ_NOT_OPEN`(존재하지 않음/DRAFT·CLOSED
  상태), `QUIZ_NOT_STARTED`(상태는 OPEN이지만 아직 시작 시각 전), `QUIZ_ENDED`(상태는 OPEN이지만
  종료 시각 지남), `NEEDS_EMAIL_REGISTRATION` — 시간 관련 두 코드는 출입코드/학번과 무관한
  사유임을 클라이언트가 구분해 보여줄 수 있도록 `QUIZ_NOT_OPEN`과 분리했다.

### `registerStudentEmail`

- **Request**: `{ studentId: string, name: string }` (이메일은 `context.auth`에서)
- **처리**: FR-011~FR-012. 이미 등록된 학번, 이미 다른 학번에 연결된 이메일은 거부.
- **Response**: `{ ok: true }` → 이후 클라이언트가 `enterQuiz`를 재호출.

### `practiceRun`

- **Request**: `{ quizId: string, problemId: string, code: string }`
- **처리**: FR-013~FR-016. `(quizId, problemId, code, 문항 updatedAt)` 캐시 키로 먼저 조회 →
  캐시 히트 시 Grader 미호출(횟수 차감도 없음) → 캐시 미스면 `runTransaction`으로
  `participants/{quizId}_{studentId}.runsUsedByProblem.{problemId}`을 조회해 `maxRuns` 미만인
  경우에만 1 증가시켜 커밋(research.md §5 — `FieldValue.increment()` 단독 사용은 조건부 거부가
  안 되므로 쓰지 않는다) → 트랜잭션 커밋에 성공한 요청만 Grader 호출(contracts/grader-api.md
  `/grade`) → 비공개 TC 마스킹 → `SYSTEM_ERROR`가 아닌 결과만 캐시에 저장. `problemSecrets`
  문서에서 테스트케이스 배열을 1회 읽어 Grader 요청을 구성한다.
- **Response**: `{ status, score, maxScore, compileErrorMessage?, tcResults: [...], remainingRuns, usedCache: boolean }`
- **오류 코드**: `NO_RUNS_LEFT`, `QUIZ_NOT_ACTIVE`

### `finalSubmit`

- **Request**: `{ quizId: string, submissions: [{problemId: string, code: string}] }`
- **처리**: FR-017~FR-019. 이미 SUBMITTED/FINALIZED면 기존 결과 반환(FR-018). 퀴즈에 실제로
  속한 problemId만 채택. 서버 시각으로 종료 여부 재검증(헌법 VII). 문항별 코드를
  `participants/{quizId}_{studentId}.submissions` map 필드에 트랜잭션으로 한 번에 기록하고
  `finalStatus`를 `'SUBMITTED'`로 갱신한다(구 설계의 문항별 서브컬렉션 배치 쓰기 대신 문서 1건
  업데이트로 단순화, data-model.md 참고).
- **Response**: `{ participantStatus: 'SUBMITTED', finalSubmittedAt }`
- **오류 코드**: `QUIZ_CLOSED`

### `getMyResult`

- **Request**: `{ quizId: string }`
- **Response**: `{ participantStatus, finalTotal?, maxTotal?, perProblem?: [{problemId, status, score, maxScore, tcResults}] }` (FINALIZED 이전엔 점수 없이 상태만)

## 교사용 — 준비

### `listQuizzes`

- **Request**: `{}`
- **처리**: firestore.rules는 `status == 'OPEN'`인 퀴즈만 클라이언트 직접 read를 허용하므로,
  교사가 자신의 `DRAFT`/`CLOSED` 퀴즈까지 포함한 목록을 보려면 이 함수가 필요하다
  (research.md §18). `deletedAt == null`인 퀴즈만 반환한다.
- **Response**: `{ quizzes: [{quizId, title, status, startAt, endAt}] }`

### `getQuizForEdit`

- **Request**: `{ quizId: string }`
- **처리**: QuizManager(퀴즈 필드 편집)와 ProblemEditor(문항·테스트케이스 편집)가 필요로
  하는 모든 데이터를 한 번에 반환한다. 문항별 `problemSecrets.items`(정답 포함)도 그대로
  포함한다 — 헌법 III은 "학생에게" 정답을 숨기는 원칙이므로 교사에게는 해당하지 않는다.
- **Response**: `{ quizId, title, description, startAt, endAt, accessCode, status, maxRunsPerProblem, courseId, problems: [{problemId, order, title, description, initialCode, maxRuns, pointsTotal, testCases: TestCase[]}] }`

### `upsertQuiz`, `upsertProblem`, `deleteProblem`

- CRUD 계열. FR-003~FR-004. Request/Response는 data-model.md의 대응 문서 필드와 동일한 모양.
  `upsertProblem`은 문항 메타데이터(제목·설명·초기코드·maxRuns)만 다룬다 — 신규 생성 시에만
  `pointsTotal: 0`으로 초기화하고, 이후 메타데이터 수정 시에는 `pointsTotal`/`updatedAt`을
  **건드리지 않는다**(그 둘의 소유자는 아래 `upsertTestCase`/`deleteTestCase`뿐 —
  data-model.md "pointsTotal/updatedAt의 소유권" 참고). `deleteProblem`은 하드 삭제가 아니라
  `deletedAt`을 설정하는 소프트 삭제다(Firestore에 캐스케이드 삭제가 없어 하위
  `problemSecrets`가 고아로 남기 때문).

### `upsertTestCase`

- **Request**: `{ quizId: string, problemId: string, testCase: { tcId?: string, tcNo: number, input: string, expected: string, points: number, isPublic: boolean, description: string } }`
  — `tcId`가 없으면 새 테스트케이스 추가, 있으면 해당 테스트케이스만 치환. **클라이언트는
  `items` 전체 배열이나 `pointsTotal`을 절대 보내지 않는다** — 항상 테스트케이스 1개 단위의
  델타만 보낸다.
- **처리**: FR-005~FR-006. 단일 Firestore 트랜잭션 안에서 (1) `tx.get()`으로
  `problemSecrets/{problemId}`의 **현재 `items`를 트랜잭션 내부에서 새로 읽고**, (2) 그
  배열에 요청받은 테스트케이스 1개만 추가/치환해 새 배열을 만들고, (3) 그 새 배열 기준으로
  배점 합을 다시 계산해 `problemSecrets.items`/`updatedAt`과 `problems.pointsTotal`/
  `updatedAt`을 함께 쓴다.
- **동시 편집 안전성**: 배점 합계를 클라이언트가 보낸 값이나 트랜잭션 시작 전에 읽어둔 배열로
  계산하지 않고, **트랜잭션 내부에서 재조회한 최신 배열**을 기준으로 계산하기 때문에, 교사가
  같은 문항을 두 탭에서 동시에 편집해도(예: 한쪽은 테스트케이스 A 수정, 다른 쪽은 테스트케이스
  B 수정) 안전하다. Firestore 트랜잭션은 커밋 시점에 읽은 문서가 트랜잭션 도중 다른 쓰기로
  바뀌었으면 자동으로 재시도하므로, 나중에 커밋되는 트랜잭션은 먼저 커밋된 변경을 반영한
  배열 위에서 자신의 델타를 다시 적용한다 — 두 수정 모두 최종 배점 합계에 반영된다(먼저
  커밋된 수정이 누락되는 lost-update가 발생하지 않는다).

### `deleteTestCase`

- **Request**: `{ quizId: string, problemId: string, tcId: string }`
- **처리**: `upsertTestCase`와 동일한 트랜잭션 구조로, 재조회한 최신 `items` 배열에서 해당
  `tcId`만 제거한 뒤 배점 합을 다시 계산해 `problemSecrets`/`problems` 양쪽을 함께 쓴다.

두 함수 모두 이 두 문서(`problemSecrets`, `problems`)를 별도 쓰기로 나누면 "테스트케이스만
고쳤는데 `problems.updatedAt`이 그대로여서 `practiceRun`의 캐시가 무효화되지 않는" 버그가
생기므로, 반드시 하나의 트랜잭션으로 묶는다(data-model.md "두 문서의 updatedAt을 함께
갱신해야 하는 이유" 참고).

### `runPreDeployCheck`

- **Request**: `{ quizId: string }`
- **처리**: FR-007. 데이터 변경 없이 판정만 수행. 분반(`courseId`)이 연동된 퀴즈는
  `items`에 `classroomRosterSync`(수강생 명단 동기화 여부)와 `classroomDeployment`
  (Classroom 배포 여부, `courseWorkId` 존재 여부로 판정) 두 항목이 항상 `WARN` 이하로만
  추가된다 — 둘 다 `BLOCK`으로 판정하지 않는다(User Story 5는 필수지만, 급한 사정으로
  Classroom 없이 진행해야 하는 경우를 이 점검이 강제로 막지 않기 위함).
- **Response**: `{ items: [{key, level: 'PASS'|'WARN'|'BLOCK', message}], blockingCount }`

### `setQuizStatus`

- **Request**: `{ quizId: string, status: 'DRAFT'|'OPEN'|'CLOSED' }`
- **처리**: FR-008. `OPEN`으로 전환 시 최근 `runPreDeployCheck` 결과에 차단 항목이 있으면 거부.

## 교사용 — 채점/현황

### `batchGrade`

- **Request**: `{ quizId: string }`
- **처리**: FR-020~FR-023, research.md §15(동시성 상한·타임아웃). `participants`에서
  `quizId == X && finalStatus == 'SUBMITTED'`로 조회(등호 필터만 조합이라 복합 인덱스 불필요,
  data-model.md "필요한 복합 인덱스" 참고). `FINALIZED`는 스킵. 참가자별로 `submissions` map의
  각 문항 코드를 채점해 `runResults` map 필드와 `finalTotal`/`finalStatus: 'FINALIZED'`를 한
  번의 문서 업데이트로 기록한다. 응답 직전에 `quizzes.courseId`가 있는지, 그리고 `FINALIZED`
  참가자 중 아직 `pushGrades`가 성공한 적 없는 인원이 있는지 확인해 `classroomGradesPending`을
  채운다(FR-023, WARN 수준 안내 — 성적 반영 실행을 강제하지는 않음).
- **Response**: `{ processed, skipped, failed, failedParticipantIds: string[], classroomGradesPending: boolean }`

### `getParticipantOverview`

- **Request**: `{ quizId: string }`
- **처리**: `participants`에서 `quizId == X`, `finalSubmittedAt` 정렬 조회 — 이 조합은 복합
  인덱스가 필요하다(data-model.md "필요한 복합 인덱스" 참고). `quizzes.courseId`가 있으면
  `rosters`(`courseId ==`)로 "대상 학생 전원" 목록을 얻어, 참가자 문서가 없는 수강생은
  `status: 'NOT_ENTERED'`(미입장)로 정렬된 결과 뒤에 이어 붙인다(research.md §20).
  `courseId`가 없으면 이미 입장한 참가자만 반환한다(전원을 판단할 명부가 없음).
- **Response**: `{ participants: [{studentId, name, status: 'NOT_ENTERED'|'IN_PROGRESS'|'SUBMITTED'|'FINALIZED', submittedAt?, finalTotal?}] }` (FR-025)

### `getParticipantDetail`

- **Request**: `{ quizId: string, studentId: string }`
- **처리**: 참가자 문서 1건을 읽어 `submissions`/`runResults` map 필드를 그대로 반환한다(구
  설계의 서브컬렉션 다중 조회 대신 단일 문서 읽기).
- **Response**: `{ submissions: {...}, runResults: {...} }`

## 교사용 — Classroom (필수, User Story 5)

### `syncRoster`

- **Request**: `{ courseId: string }`
- **처리**: Classroom 계정 이메일의 로컬파트(`@` 앞)를 학번으로 간주해 `students`/`rosters`를
  갱신한다. 숫자로만 된 학번 형식이 아닌 계정은 건너뛰고 `skipped`에 집계한다(FR-027).
  이 경로는 `registerStudentEmail`(학생이 직접 호출, 한 번 등록하면 불변, FR-012)과 달리
  Classroom을 신뢰된 출처로 보고 이미 등록된 학번의 이메일도 최신 값으로 덮어쓸 수 있다
  (research.md §21).
- **Response**: `{ newStudents, updatedEmails, newRosterEntries, updatedRosterEntries, skipped }` (FR-026~027)

### `deployClassroomAssignment`

- **Request**: `{ quizId: string }`
- **처리**: FR-028~029. 이미 `courseWorkId`가 있으면 `ALREADY_DEPLOYED` 오류.
- **Response**: `{ courseWorkId, courseWorkLink }`

### `resetClassroomDeployment`

- **Request**: `{ quizId: string }` — 명시적 초기화(재배포 전 필수, FR-029)

### `pushGrades`

- **Request**: `{ quizId: string }`
- **처리**: FR-030~031. `FINALIZED` 참가자만 대상, 없으면 `NO_FINALIZED_PARTICIPANTS` 오류.
  성공한 참가자의 `participants.gradePushedAt`을 서버 시각으로 기록한다(research.md §19 —
  `batchGrade`의 `classroomGradesPending` 판단이 이 필드에 의존함).
- **Response**: `{ succeeded, failed, failedStudentIds: string[] }`

## 교사용 — 아카이브/삭제 (User Story 6)

### `archiveQuiz`

- **Request**: `{ quizId: string }`
- **처리**: FR-037~038. Grader/Classroom과 마찬가지로 실패 시 1회 재시도(헌법 VI).
- **Response**: `{ spreadsheetUrl, createdAt }`

### `deleteQuizData`

- **Request**: `{ quizId: string, confirmWithoutArchive?: boolean }`
- **처리**: FR-039~040. `archivedAt`이 없고 `confirmWithoutArchive`가 true가 아니면
  `NOT_ARCHIVED_YET` 오류로 응답(클라이언트가 경고 후 재호출 시 `confirmWithoutArchive: true`).
- **Response**: `{ ok: true, deletedAt }`
