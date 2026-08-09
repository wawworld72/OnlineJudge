# Data Model: C언어 온라인 저지 퀴즈 시스템

Firestore 컬렉션 경로와 문서 스키마. spec.md의 Key Entities와 1:1 대응한다. 모든 컬렉션은
클라이언트 직접 write가 금지되며(헌법 III), `problemSecrets`는 클라이언트 read도 금지된다.

## 전역 규칙 (모든 컬렉션에 적용)

- **서버 타임스탬프만 사용**: 이 문서에 나오는 모든 `timestamp` 필드는 Cloud Functions(Admin
  SDK)의 `FieldValue.serverTimestamp()`로만 채운다. 클라이언트가 보낸 시각 문자열을 그대로
  저장하는 코드는 절대 작성하지 않는다(헌법 VII — 그렇지 않으면 학생이 브라우저 시계를 조작해
  제출 시각을 속일 수 있다).
- **스키마는 Firestore가 아니라 런타임 검증이 강제한다**: Firestore는 관계형 DB와 달리 스키마를
  강제하지 않는다 — 이 문서가 정의한 열거형(예: `finalStatus`)에 없는 값도 에러 없이 그대로
  저장된다. TypeScript 타입은 컴파일 타임에만 유효하므로, 아래 각 필드의 실제 강제는 Cloud
  Functions 내부의 Zod 런타임 검증이 책임진다(research.md §10).
- **보안 규칙과 Admin SDK의 관계**: Cloud Functions(Admin SDK)는 Firestore 보안 규칙을 완전히
  우회한다 — 규칙은 서버 코드의 정확성을 보장하지 않으며, 서버가 쓰는 값이 맞는지는 오직
  Callable Function 내부 로직(신원 검증, 트랜잭션, 위 런타임 검증)이 책임진다. 반대로 보안
  규칙은 **클라이언트 SDK로부터의 직접 접근을 막는 유일한 기술적 장치**다 — Firebase
  클라이언트 `apiKey`/`projectId`는 공개값이라 누구나 앱 UI를 거치지 않고 브라우저 콘솔에서
  Firebase JS SDK로 직접 Firestore 쓰기를 "시도"할 수 있으며, 그 시도를 실제로 거부하는 것이
  바로 이 규칙이다. "우리 앱 코드가 클라이언트에서 쓰기를 호출하지 않는다"는 코드 관행이고,
  "그런 시도가 실패한다"는 보안 규칙이 하는 일이다 — 이 둘을 혼동하면 안 된다
  (contracts/firestore-access-summary.md 참고).

## students/{studentId}

| 필드 | 타입 | 설명 |
|---|---|---|
| name | string | 학생 이름 |
| email | string \| null | 등록된 이메일. 최초 입장 시 등록되기 전까지 null (FR-011) |
| status | `'ACTIVE' \| 'INACTIVE'` | 비활성 학생은 입장 거부 대상 (FR-009) |

**불변 규칙**: `email`은 한 번 채워지면 재등록 불가(FR-012). 같은 `email`이 다른 `studentId`
문서에 존재할 수 없다(애플리케이션 레벨 유일성 검사, Callable Function에서 수행).

## rosters/{courseId}\_{studentId}

| 필드 | 타입 | 설명 |
|---|---|---|
| courseId | string | 분반 식별자 |
| courseName | string | 분반 이름 |
| studentId | string | students 문서 참조 |
| name, email | string | 동기화 시점의 스냅샷 |
| syncedAt | timestamp | 마지막 Classroom 동기화 시각 (FR-026) |

## quizzes/{quizId}

| 필드 | 타입 | 설명 |
|---|---|---|
| title | string | 제목 |
| description | string | 설명 |
| startAt, endAt | timestamp | 응시 기간 (헌법 VII: 서버 기준 시간으로만 판단) |
| accessCode | string | 출입코드 |
| status | `'DRAFT' \| 'OPEN' \| 'CLOSED'` | PAUSED 없음 (Clarify Q2로 범위 제외) |
| maxRunsPerProblem | number | 문항 기본 최대 실행 횟수 |
| courseId | string \| null | 연결된 분반 |
| courseWorkId, courseWorkLink | string \| null | Classroom 과제 배포 결과 (FR-028~029) |
| archivedAt | timestamp \| null | 마지막 아카이브 생성 시각. null이면 미아카이브 (FR-040) |
| archiveSpreadsheetUrl | string \| null | 아카이브 스프레드시트 링크 |
| deletedAt | timestamp \| null | 삭제 실행 시각. 설정되면 하위 데이터는 이미 제거됨 (FR-039) |

**상태 전이**: `DRAFT → OPEN → CLOSED` (교사가 명시적으로 전환, FR-008). `CLOSED` 이후에도
`archivedAt`/`deletedAt`은 독립적으로 설정 가능.

## quizzes/{quizId}/problems/{problemId}

| 필드 | 타입 | 설명 |
|---|---|---|
| order | number | 문항 순서 |
| title, description | string | description은 Markdown 원문 (렌더링은 클라이언트) |
| initialCode | string | 초기 코드 |
| maxRuns | number \| null | null이면 퀴즈의 `maxRunsPerProblem` 사용 (FR-004) |
| pointsTotal | number | `problemSecrets`의 테스트케이스 배점 합, 문항 저장/수정 시 서버가 재계산 (FR-006) |
| updatedAt | timestamp | 테스트케이스/배점 수정 캐시 무효화 판단에 사용 (FR-016) |
| deletedAt | timestamp \| null | 소프트 삭제 시각. null이면 유효한 문항 (FR-004) |

**소프트 삭제(`deletedAt`)를 쓰는 이유**: Firestore는 관계형 DB의 외래키·캐스케이드 삭제 개념이
없다. `problems/{problemId}` 문서를 하드 삭제해도 그 아래 `problemSecrets/{problemId}`(구
`testCases` 서브컬렉션)는 고아 상태로 그대로 남아 저장 공간을 계속 차지한다. 이는 "정책적
선호"가 아니라 Firestore의 구조적 한계를 피하기 위한 선택이다 — 모든 조회는 `deletedAt ==
null` 필터를 반드시 포함해야 한다.

## quizzes/{quizId}/problemSecrets/{problemId} (구 `testCases` 서브컬렉션)

| 필드 | 타입 | 설명 |
|---|---|---|
| items | array<`{tcId, tcNo, input, expected, points, isPublic, description}`> | 문항의 테스트케이스 전체 — **클라이언트 read 전면 금지**(헌법 III) |
| updatedAt | timestamp | `problems.updatedAt`과 함께 갱신(FR-016 캐시 무효화 판단) |

**왜 배열 필드로 통합했는가(서브컬렉션이 아니라)**: 연습 실행마다 Cloud Functions가 문항의
테스트케이스를 전부 읽어 Grader에 보내야 한다. 테스트케이스를 문항당 N개의 개별 문서(서브
컬렉션)로 두면 매 실행마다 N번의 문서 읽기가 발생한다. 이 프로젝트 규모(문항당 테스트케이스
소수, 문서 크기 한도 1MiB에 비해 여유가 큼)에서는 배열 필드 하나로 묶어 1회 읽기로 줄이는 것이
합리적이다(§"submissions/runResults 통합"과 같은 논리 — 아래 참고).

**절대 `problems/{problemId}`와 합치지 않는 이유**: 학생은 `problems/{problemId}` 문서를
직접 읽는다(퀴즈가 OPEN일 때, 설명·초기코드 등 정답 없는 필드). 같은 문서에 정답이 들어있는
`items` 배열을 두면 Firestore 문서 단위 read 권한 특성상 그 문서를 읽는 즉시 정답이 함께
노출된다 — 헌법 원칙 III(정답 및 상태 무결성 보호)에 대한 직접적인 위반이 된다. 그래서
`problemSecrets`는 항상 별도의, 클라이언트에게 전면 차단된 문서로 유지한다.

## participants/{quizId}\_{studentId}

| 필드 | 타입 | 설명 |
|---|---|---|
| quizId, studentId | string | 문서ID를 구성하는 값(서버가 재계산해 대조, 헌법 I) |
| enteredAt | timestamp | 최초 입장 시각 |
| finalStatus | `'IN_PROGRESS' \| 'SUBMITTED' \| 'FINALIZED'` | |
| finalSubmittedAt | timestamp \| null | |
| finalTotal | number | 확정 총점 |
| completedCount, totalCount | number | 참가자 현황 화면용 진행도 (FR-025) |
| runsUsedByProblem | map<problemId, number> | 문항별 실행 횟수 사용량. `runTransaction`으로만 증가(FR-014, research.md §5) |
| submissions | map<problemId, `{code, submittedAt}`> | 문항별 최종 제출 코드(구 `submissions` 서브컬렉션, FR-017) |
| runResults | map<problemId, `{status, score, maxScore, compileErrorMessage, tcResults}`> | 문항별 확정 채점 결과(구 `runResults` 서브컬렉션, FR-024) |

**생성 시점**: `enterQuiz`(최초 입장) 시점에 생성하며 `finalStatus: 'IN_PROGRESS'`,
`runsUsedByProblem: {}`, `submissions: {}`, `runResults: {}`로 초기화한다(research.md §13).
문서가 아직 없는 참가자 조회는 "미입장"으로 해석한다. 연습 실행 횟수 카운터가 응시 시작
직후부터 필요하기 때문에, "최종 제출 시점에 생성"(원본 개발 문서 4.1절)에서 이렇게 변경했다.

**서브컬렉션 대신 map 필드로 통합한 이유**: 문항이 5개면 참가자 1명의 전체 응시 상태를 읽는 데
기존 구조(참가자 1 + submissions 5 + runResults 5)로는 11번의 문서 읽기가 필요했다. 이 규모
(퀴즈당 문항 5개 내외)에서는 서브컬렉션으로 쪼갤 이점이 크지 않고, map 필드로 합치면 참가자
전체 상태 조회가 1번으로 줄어든다(문서 크기는 C 코드+테스트케이스 결과 몇 개 수준이라 1MiB
한도에 전혀 문제없다). 최종 제출도 여러 문서에 걸친 배치 쓰기 대신 참가자 문서 1건의 트랜잭션
업데이트로 끝난다. 서브컬렉션이 유리해지는 경우(문항 수백 개 이상, 문항별 독립 실시간 구독
필요)는 이번 규모에는 해당하지 않는다.

## accessLogs/{autoId}

| 필드 | 타입 | 설명 |
|---|---|---|
| participantId | string | |
| action | string | 예: `ENTER`, `FINAL_SUBMIT` |
| timestamp | timestamp | |
| userAgent | string | |
| expiresAt | timestamp | 작성 시각 + 6개월. 이 필드에 Firestore TTL 정책을 설정해 자동 삭제(research.md §11) |

## archives/{quizId} (신규 — User Story 6 지원)

| 필드 | 타입 | 설명 |
|---|---|---|
| quizId | string | 대상 퀴즈 |
| createdAt | timestamp | 아카이브 생성 시각 |
| spreadsheetUrl | string | 생성된 Google 스프레드시트 링크 |
| createdBy | string | 실행한 교사 이메일 |

`quizzes/{quizId}.archivedAt`/`archiveSpreadsheetUrl`은 이 문서의 최신 값을 비정규화해 둔
캐시이며, 진짜 이력은 `archives/{quizId}`(퀴즈당 여러 번 아카이브할 경우를 대비해 실제로는
`archives/{quizId}/exports/{autoId}`로 서브컬렉션화할 수도 있으나, 이번 범위에서는 "가장 최근
아카이브 1건"만 추적하면 충분하다 — FR-040의 경고 조건은 "아카이브가 존재하는지" 여부만 필요).

## 필요한 복합 인덱스

Firestore는 등호(`==`) 필터만 여러 개 조합하는 쿼리는 단일 필드 인덱스를 자동으로 병합해
처리하므로 복합 인덱스가 필요 없다. 예를 들어 `batchGrade`가 쓰는 `participants`에 대한
`quizId == X && finalStatus == 'SUBMITTED'` 쿼리는 별도 설정이 필요 없다.

복합 인덱스가 실제로 필요한 경우는 등호 필터에 범위(`>`/`<`) 또는 `orderBy`가 함께 쓰일 때뿐이며,
이 프로젝트에서는 다음 1건이다:

| 쿼리 | 인덱스 |
|---|---|
| `getParticipantOverview`: `participants`에서 `quizId == X`, `finalSubmittedAt` 오름차순 정렬 | `participants` 컬렉션에 `(quizId ASC, finalSubmittedAt ASC)` 복합 인덱스 |

이 인덱스는 `firestore.indexes.json`에 명시적으로 정의해야 한다(Firestore 콘솔이 쿼리 실행
시 자동 제안하지만, 배포 시점에 미리 선언해두는 것을 원칙으로 한다).

## 관계 요약

```
quizzes (1) ──< problems (N, 소프트 삭제) ──1:1── problemSecrets (테스트케이스 배열, 전면 차단)
quizzes (1) ──< participants (N, quizId_studentId — runsUsedByProblem/submissions/runResults
                                                     맵 필드 포함)
students (1) ──< participants (N, 서로 다른 quizId)
rosters (N) ──> students (1), quizzes.courseId로 분반 연결
archives (0..1 per quiz) ──> quizzes (1)
```
