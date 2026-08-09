# Contract: Frontend ↔ Cloud Functions (Firebase Callable Functions)

모든 함수는 Firebase Callable Functions로 호출되며, `context.auth`(로그인 이메일)가 없으면
즉시 거부한다. 각 함수는 헌법 원칙 I·II에 따라 요청 파라미터(학번·이름·participantId 등)를
그대로 신뢰하지 않고 서버에서 재검증/재계산한다. 오류는 `{code, message}` 형태로 반환하며
`message`는 사용자에게 보여줄 일반 안내문(헌법 VI), 상세 원인은 Cloud Logging에만 남긴다.

## 학생용

### `enterQuiz`
- **Request**: `{ quizId: string, accessCode: string, studentId: string, name: string }`
- **처리**: FR-009~FR-011 순서로 검증(출입코드 → 퀴즈 상태/시간 → 학번·이름·이메일 3중 대조).
  이메일 미등록 학번이면 `NEEDS_EMAIL_REGISTRATION` 오류로 응답해 5.3절 플로우로 분기.
- **Response**: `{ participantStatus, problems: [{problemId, title, description, initialCode, maxRuns, remainingRuns, pointsTotal}], endAt, existingSubmission?, gradedResult? }`
- **오류 코드**: `INVALID_ACCESS_CODE`, `IDENTITY_MISMATCH`, `QUIZ_NOT_OPEN`, `NEEDS_EMAIL_REGISTRATION`

### `registerStudentEmail`
- **Request**: `{ studentId: string, name: string }` (이메일은 `context.auth`에서)
- **처리**: FR-011~FR-012. 이미 등록된 학번, 이미 다른 학번에 연결된 이메일은 거부.
- **Response**: `{ ok: true }` → 이후 클라이언트가 `enterQuiz`를 재호출.

### `practiceRun`
- **Request**: `{ quizId: string, problemId: string, code: string }`
- **처리**: FR-013~FR-016. `(quizId, problemId, code, 문항 updatedAt)` 캐시 키로 먼저 조회 →
  캐시 히트 시 Grader 미호출(횟수 차감도 없음) → 캐시 미스면 Firestore 트랜잭션으로 남은 횟수
  확인·차감(research.md §5) → Grader 호출(contracts/grader-api.md `/grade`) → 비공개 TC
  마스킹 → `SYSTEM_ERROR`가 아닌 결과만 캐시에 저장.
- **Response**: `{ status, score, maxScore, compileErrorMessage?, tcResults: [...], remainingRuns, usedCache: boolean }`
- **오류 코드**: `NO_RUNS_LEFT`, `QUIZ_NOT_ACTIVE`

### `finalSubmit`
- **Request**: `{ quizId: string, submissions: [{problemId: string, code: string}] }`
- **처리**: FR-017~FR-019. 이미 SUBMITTED/FINALIZED면 기존 결과 반환(FR-018). 퀴즈에 실제로
  속한 problemId만 채택. 서버 시각으로 종료 여부 재검증(헌법 VII).
- **Response**: `{ participantStatus: 'SUBMITTED', finalSubmittedAt }`
- **오류 코드**: `QUIZ_CLOSED`

### `getMyResult`
- **Request**: `{ quizId: string }`
- **Response**: `{ participantStatus, finalTotal?, maxTotal?, perProblem?: [{problemId, status, score, maxScore, tcResults}] }` (FINALIZED 이전엔 점수 없이 상태만)

## 교사용 — 준비

### `upsertQuiz`, `deleteProblem`, `upsertProblem`, `upsertTestCase` 등
- CRUD 계열. FR-003~FR-005. Request/Response는 각각 data-model.md의 대응 문서 필드와 동일한
  모양이며, 서버는 저장 시 문항의 `pointsTotal`을 재계산한다(FR-006).

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
- **처리**: FR-020~FR-023. `participants` 중 `SUBMITTED`만 대상, `FINALIZED`는 스킵.
- **Response**: `{ processed, skipped, failed, failedParticipantIds: string[] }`

### `getParticipantOverview`
- **Request**: `{ quizId: string }`
- **Response**: `{ participants: [{studentId, name, status, submittedAt?, finalTotal?}] }` (FR-025)

### `getParticipantDetail`
- **Request**: `{ quizId: string, studentId: string }`
- **Response**: `{ submissions: [...], runResults: [...] }`

## 교사용 — Classroom (선택, User Story 5)

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
