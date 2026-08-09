# Data Model: C언어 온라인 저지 퀴즈 시스템

Firestore 컬렉션 경로와 문서 스키마. spec.md의 Key Entities와 1:1 대응한다. 모든 컬렉션은
클라이언트 직접 write가 금지되며(헌법 III), `testCases`는 클라이언트 read도 금지된다.

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
| pointsTotal | number | 하위 testCases의 points 합, 문항 저장/수정 시 서버가 재계산 (FR-006) |
| updatedAt | timestamp | 테스트케이스/배점 수정 캐시 무효화 판단에 사용 (FR-016) |

## quizzes/{quizId}/problems/{problemId}/testCases/{tcId}

| 필드 | 타입 | 설명 |
|---|---|---|
| tcNo | number | 테스트케이스 번호 |
| input | string | 입력값 |
| expected | string | 기대 출력값 — **클라이언트 read 전면 금지**(헌법 III) |
| points | number | 배점 |
| isPublic | boolean | 공개 여부 |
| description | string | 설명 |

## participants/{quizId}\_{studentId}

| 필드 | 타입 | 설명 |
|---|---|---|
| quizId, studentId | string | 문서ID를 구성하는 값(서버가 재계산해 대조, 헌법 I) |
| enteredAt | timestamp | 최초 입장 시각 |
| finalStatus | `'IN_PROGRESS' \| 'SUBMITTED' \| 'FINALIZED'` | |
| finalSubmittedAt | timestamp \| null | |
| finalTotal | number | 확정 총점 |
| completedCount, totalCount | number | 참가자 현황 화면용 진행도 (FR-025) |

**생성 시점**: 최초 조회 시 문서가 없으면 "미입장"으로 간주하고 생성하지 않으며, 최초 최종 제출
시점에 생성한다(원본 개발 문서 4.1절 규칙 그대로).

## participants/{quizId}\_{studentId}/submissions/{problemId}

| 필드 | 타입 | 설명 |
|---|---|---|
| code | string | 최종 제출 코드 (FR-017, 제출 후 불변) |
| submittedAt | timestamp | |
| practiceRunSummary | array | 클라이언트가 보낸 연습 실행 이력 참고용 — 서버는 신뢰하지 않음 |

## participants/{quizId}\_{studentId}/runResults/{problemId}

| 필드 | 타입 | 설명 |
|---|---|---|
| status | `'JUDGED' \| 'COMPILE_ERROR' \| 'SYSTEM_ERROR' \| 'RUNTIME_ERROR' \| 'NOT_ATTEMPTED'` | |
| score, maxScore | number | |
| compileErrorMessage | string \| null | |
| tcResults | array<`{tcNo, passed, points, isPublic, input?, expected?, actual?}`> | 비공개 TC는 input/expected/actual 생략, `passed`만 노출 (FR-024) |

**생성 시점**: 일괄 채점(FR-020~023) 실행 시에만 생성/갱신. 연습 실행 결과는 이 컬렉션에 절대
쓰지 않는다(헌법 IV).

## accessLogs/{autoId}

| 필드 | 타입 | 설명 |
|---|---|---|
| participantId | string | |
| action | string | 예: `ENTER`, `FINAL_SUBMIT` |
| timestamp | timestamp | |
| userAgent | string | |

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

## 관계 요약

```
quizzes (1) ──< problems (N) ──< testCases (N)
quizzes (1) ──< participants (N, quizId_studentId) ──< submissions (=problems 수)
                                                  └──< runResults (=problems 수)
students (1) ──< participants (N, 서로 다른 quizId)
rosters (N) ──> students (1), quizzes.courseId로 분반 연결
archives (0..1 per quiz) ──> quizzes (1)
```
