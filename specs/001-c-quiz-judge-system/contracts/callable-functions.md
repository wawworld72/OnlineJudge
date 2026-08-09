# Contract: Frontend ↔ Cloud Functions (Firebase Callable Functions)

모든 함수는 Firebase Callable Functions로 호출되며, `context.auth`(로그인 이메일)가 없으면
즉시 거부한다. 각 함수는 헌법 원칙 I·II에 따라 요청 파라미터(학번·이름·participantId 등)를
그대로 신뢰하지 않고 서버에서 재검증/재계산한다. 오류는 `{code, message}` 형태로 반환하며
`message`는 사용자에게 보여줄 일반 안내문(헌법 VI), 상세 원인은 Cloud Logging에만 남긴다.

모든 함수는 `enforceAppCheck: true`로 배포한다(research.md §9) — 로그인 여부와 무관하게, 실제
배포된 웹앱이 아닌 곳(예: 브라우저 콘솔에서 직접 호출)에서 온 요청은 이 계약에 도달하기 전에
거부된다. 모든 함수의 입력은 Zod 스키마로 런타임 검증한다(research.md §10).

## 학생용

### `enterQuiz`
- **Request**: `{ quizId: string, accessCode: string, studentId: string, name: string }`
- **처리**: FR-009~FR-011 순서로 검증(출입코드 → 퀴즈 상태/시간 → 학번·이름·이메일 3중 대조).
  이메일 미등록 학번이면 `NEEDS_EMAIL_REGISTRATION` 오류로 응답해 5.3절 플로우로 분기. 검증을
  통과하면 `participants/{quizId}_{studentId}` 문서가 없을 경우 이 시점에 생성한다
  (`finalStatus: 'IN_PROGRESS'`, `runsUsedByProblem/submissions/runResults: {}` — research.md
  §13, data-model.md). 이미 존재하면 그대로 조회만 한다.
- **Response**: `{ participantStatus, problems: [{problemId, title, description, initialCode, maxRuns, remainingRuns, pointsTotal}], endAt, existingSubmission?, gradedResult? }`
- **오류 코드**: `INVALID_ACCESS_CODE`, `IDENTITY_MISMATCH`, `QUIZ_NOT_OPEN`, `NEEDS_EMAIL_REGISTRATION`

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

### `upsertQuiz`, `upsertProblem`, `deleteProblem`
- CRUD 계열. FR-003~FR-004. Request/Response는 data-model.md의 대응 문서 필드와 동일한 모양.
  `upsertProblem`은 문항 메타데이터(제목·설명·초기코드·maxRuns)만 다룬다 — 신규 생성 시에만
  `pointsTotal: 0`으로 초기화하고, 이후 메타데이터 수정 시에는 `pointsTotal`/`updatedAt`을
  **건드리지 않는다**(그 둘의 소유자는 아래 `upsertTestCase`/`deleteTestCase`뿐 —
  data-model.md "pointsTotal/updatedAt의 소유권" 참고). `deleteProblem`은 하드 삭제가 아니라
  `deletedAt`을 설정하는 소프트 삭제다(Firestore에 캐스케이드 삭제가 없어 하위
  `problemSecrets`가 고아로 남기 때문).

### `upsertTestCase`, `deleteTestCase`
- FR-005~FR-006. `quizzes/{quizId}/problemSecrets/{problemId}.items` 배열 안의 원소를
  추가/치환/제거하는 **단일 Firestore 트랜잭션** 안에서, (1) 새 `items`로 배점 합을 다시
  계산해 `problemSecrets.items`와 `problemSecrets.updatedAt`을 쓰고, (2) 같은 트랜잭션으로
  `problems/{problemId}.pointsTotal`(재계산된 합)과 `problems/{problemId}.updatedAt`도 함께
  쓴다. 이 두 문서를 별도 쓰기로 나누면 "테스트케이스만 고쳤는데 `problems.updatedAt`이
  그대로여서 `practiceRun`의 캐시가 무효화되지 않는" 버그가 생기므로, 반드시 하나의 트랜잭션
  으로 묶는다(data-model.md "두 문서의 updatedAt을 함께 갱신해야 하는 이유" 참고).

### `runPreDeployCheck`
- **Request**: `{ quizId: string }`
- **처리**: FR-007. 데이터 변경 없이 판정만 수행.
- **Response**: `{ items: [{key, level: 'PASS'|'WARN'|'BLOCK', message}], blockingCount }`

### `setQuizStatus`
- **Request**: `{ quizId: string, status: 'DRAFT'|'OPEN'|'CLOSED' }`
- **처리**: FR-008. `OPEN`으로 전환 시 최근 `runPreDeployCheck` 결과에 차단 항목이 있으면 거부.

## 교사용 — 채점/현황

### `batchGrade`
- **Request**: `{ quizId: string }`
- **처리**: FR-020~FR-023. `participants`에서 `quizId == X && finalStatus == 'SUBMITTED'`로
  조회(등호 필터만 조합이라 복합 인덱스 불필요, data-model.md "필요한 복합 인덱스" 참고).
  `FINALIZED`는 스킵. 참가자별로 `submissions` map의 각 문항 코드를 채점해 `runResults` map
  필드와 `finalTotal`/`finalStatus: 'FINALIZED'`를 한 번의 문서 업데이트로 기록한다.
- **Response**: `{ processed, skipped, failed, failedParticipantIds: string[] }`

### `getParticipantOverview`
- **Request**: `{ quizId: string }`
- **처리**: `participants`에서 `quizId == X`, `finalSubmittedAt` 정렬 조회 — 이 조합은 복합
  인덱스가 필요하다(data-model.md "필요한 복합 인덱스" 참고).
- **Response**: `{ participants: [{studentId, name, status, submittedAt?, finalTotal?}] }` (FR-025)

### `getParticipantDetail`
- **Request**: `{ quizId: string, studentId: string }`
- **처리**: 참가자 문서 1건을 읽어 `submissions`/`runResults` map 필드를 그대로 반환한다(구
  설계의 서브컬렉션 다중 조회 대신 단일 문서 읽기).
- **Response**: `{ submissions: {...}, runResults: {...} }`

## 교사용 — Classroom (필수, User Story 5)

### `syncRoster`
- **Request**: `{ courseId: string }`
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
