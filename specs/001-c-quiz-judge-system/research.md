# Phase 0 Research: C언어 온라인 저지 퀴즈 시스템

기술적 결정과 그 근거를 정리한다. 각 항목은 Technical Context의 NEEDS CLARIFICATION을
해소하는 것을 목표로 한다.

## 1. Cloud Functions 언어/런타임

- **Decision**: TypeScript 5.x, Node.js 20 (Cloud Functions 2세대)
- **Rationale**: Firebase Admin SDK와 `googleapis`(Classroom, Sheets) 클라이언트 라이브러리가
  Node.js 생태계에서 가장 성숙하고 공식 예제가 풍부하다. TypeScript는 Firestore 문서 스키마와
  Callable Function 요청/응답 타입을 코드 레벨에서 강제해, 헌법 원칙 I(서버 신뢰 경계)의 신원·
  참가자ID 재계산 로직에서 타입 실수를 줄인다.
- **Alternatives considered**: Python(Cloud Functions 2세대에서 지원되지만 Classroom/Sheets
  연동 라이브러리·예제가 Node 대비 적음, 팀 표준화 이점 없음 → 기각).

## 2. 외부 채점 서비스(Grader) 연동 계약

- **Decision**: 이미 운영 중인 외부 Grader 서버가 존재한다(사용자 확인, 2026-08-09). 접속 정보는
  환경 변수 `GRADER_SERVICE_URL`/`GRADER_AUTH_TOKEN`(헤더 `X-Auth-Token`)으로 주입하고,
  `POST {GRADER_SERVICE_URL}/grade`에 `{code, testCases, timeLimitSec, memLimitKb}`를 보내
  `{ok, status, score, maxScore, compileErrorMessage, tcResultsFull}`을 동기로 받는 기존
  계약을 그대로 채택한다(`contracts/grader-api.md`). 참고로 공유받은 호출 예시 코드는 Google
  Apps Script였으나, 이 시스템의 백엔드는 Firebase Cloud Functions로 확정되었다 — Apps Script
  코드는 계약(엔드포인트·헤더·요청/응답 형태)만 참고하고, 구현은 TypeScript Cloud Functions로
  동일한 HTTP 계약을 호출한다.
- **Rationale**: 이미 존재하는 서비스의 실제 계약을 그대로 따르는 것이 새로 계약을 설계하는
  것보다 통합 리스크가 낮다. 동기식 단일 호출 방식이므로 헌법의 "쓰기 경로 단일화"·"장애
  복원력" 원칙(Cloud Functions가 유일한 호출 지점, 실패 시 1회 재시도)도 그대로 적용 가능하다.
- **Alternatives considered**: 해당 없음 — 기존 서비스의 계약을 그대로 수용.

## 3. 프론트엔드 프레임워크

- **Decision**: React 18 + Vite, 정적 빌드로 Firebase Hosting에 배포. 학생/교사 화면은 하나의
  SPA 안에서 라우팅만 분리.
- **Rationale**: 문항 탭·실행 횟수 배지·단계별 지연 안내·모달 등 상태가 많은 화면(User Story
  1·2·6)에 컴포넌트 기반 프레임워크가 순수 DOM 조작보다 유지보수에 유리하다. 정적 빌드이므로
  Firebase Hosting 비용(무료 한도)에는 영향이 없다(헌법 IV와 무관).
- **Alternatives considered**: 순수 Vanilla JS(초기 러닝커브는 낮지만 탭/타이머/모달 상태 관리가
  많아질수록 유지보수 비용 증가 → 기각), Vue/Svelte(기능상 동등하지만 팀 표준화 근거 없음 →
  React를 기본값으로 채택).

## 4. C 코드 에디터 컴포넌트

- **Decision**: CodeMirror 6 + `@codemirror/lang-cpp`
- **Rationale**: Monaco Editor보다 번들 크기가 작아 Hosting 대역폭·초기 로딩 성능(헌법 V, 퀴즈
  목록 1초/입장 2초 목표)에 유리하다. C 전용 언어 모드는 없지만 C++ 모드가 C 문법 강조를
  충분히 지원한다.
- **Alternatives considered**: Monaco Editor(VSCode와 동일한 경험이지만 번들이 무겁고 이 기능
  범위(단순 코드 작성·실행)에는 과함 → 기각).

## 5. 실행 횟수 차감의 동시성 보장 (FR-014)

- **Decision**: `FieldValue.increment()`만으로는 "확인 후 증가"가 원자적이지 않아 한도를
  넘길 수 있으므로 사용하지 않는다. 대신 Firestore `runTransaction`으로 "남은 횟수 조회 → 0
  초과 확인 → 1 차감"을 원자적으로 수행한다. 트랜잭션 커밋에 성공한 요청만 Grader를 호출한다.
  카운터는 별도 문서가 아니라 `participants/{quizId}_{studentId}.runsUsedByProblem`
  (map<problemId, number>) 필드에 둔다(data-model.md 참고) — 참가자 문서 자체가 트랜잭션의
  대상이 된다.
- **Rationale**: 클라이언트가 같은 문항에 실행 요청을 동시에 여러 번 보내도(Clarify Session
  Q4), Firestore 트랜잭션의 낙관적 동시성 제어가 재시도로 정확히 한도를 지킨다. 별도의 락 서버나
  큐를 두지 않아 비용 상한(헌법 IV)과도 충돌하지 않는다.
- **Alternatives considered**: `FieldValue.increment(1)` 단독 사용(무조건 더하기만 하고 조건부
  거부를 못 해 동시 요청 시 한도 초과 가능 → 기각). 애플리케이션 레벨 락(Redis 등 별도 인프라)은
  무료 운영 목표에 반하므로 기각. 단순 읽고-쓰기(non-transactional)는 경합 상황에서 초과 실행을
  허용하므로 Clarify 답변(A: 정확히 지켜야 함)과 충돌해 기각. 카운터를 참가자 문서와 분리한
  별도 문서에 두는 방안은, 참가자 문서 자체를 map 필드로 통합하기로 한 결정(§13, data-model.md)과
  일관되지 않고 트랜잭션 대상 문서를 하나 더 늘리므로 기각.

## 9. 부정 사용 방지 계층 — Firebase App Check

- **Decision**: 모든 Callable Function에 Firebase App Check를 강제(`enforceAppCheck: true`)
  한다. 웹 프론트엔드는 reCAPTCHA v3(또는 Enterprise) 공급자로 App Check를 초기화하고, Emulator
  Suite/CI에서는 App Check 디버그 토큰 공급자를 사용해 테스트가 막히지 않게 한다.
- **Rationale**: 서버 트랜잭션(§5)은 "요청이 한도를 넘지 않는지"를 논리적으로 보장하지만,
  "그 요청이 실제 배포된 우리 웹앱에서 온 것인지"는 별개의 문제다 — 로그인한 학생이 브라우저
  콘솔에서 Callable Function을 직접 호출해도 신원 검증과 트랜잭션은 그대로 통과하므로, 이 경로
  자체를 줄이려면 요청 출처를 검증하는 계층이 하나 더 필요하다. App Check는 Firebase가 제공하는
  전용 기능이라 별도 인프라 없이(헌법 IV 비용 상한과 충돌 없이) 추가할 수 있다.
- **Alternatives considered**: 커스텀 요청 서명/디바이스 핑거프린팅(자체 구현·유지보수 비용이
  크고 App Check가 이미 해결하는 문제를 재발명하는 것 → 기각).

## 10. Firestore 스키마 미강제 → 런타임 검증

- **Decision**: Cloud Functions 내부에서 Zod로 모든 Callable Function 입력과, Firestore에
  쓰기 전 최종 객체 형태를 런타임 검증한다.
- **Rationale**: Firestore는 관계형 DB와 달리 스키마를 강제하지 않는다 — 오타가 있는 필드나
  값(예: `finalStatus: 'SUMBITTED'`)도 에러 없이 그대로 저장된다. TypeScript의 타입 검사는
  컴파일 타임에만 유효하므로, data-model.md가 정의한 열거형·필수 필드를 실제로 강제하는 책임은
  런타임 검증 라이브러리가 져야 한다.
- **Alternatives considered**: 검증 없이 TypeScript 타입에만 의존(런타임에 잘못된 값이 조용히
  저장될 위험을 방치하므로 기각).

## 11. accessLogs 저장 공간 관리 — Firestore 네이티브 TTL

- **Decision**: `accessLogs.expiresAt`(작성 시각 + 6개월)에 Firestore TTL 정책을 설정해 만료된
  로그를 자동 삭제한다.
- **Rationale**: `accessLogs`는 15주 내내 계속 누적되는 유일한 무제한 증가 컬렉션이다. 6개월은
  한 학기(약 15주)와 성적 이의제기 대응 기간을 합친 여유를 두면서도, Firestore 무료 저장
  한도(1GiB, 헌법 IV)를 별도 수동 정리 없이 지킬 수 있게 한다. 퀴즈 단위 아카이브(User Story
  6)와는 별개로, accessLogs는 퀴즈에 종속되지 않는 전역 로그이므로 자체 TTL이 필요하다.
- **Alternatives considered**: 수동 정리 배치 작업(별도 스케줄러 인프라 필요 → 무료 운영
  목표와 충돌해 기각). TTL 없음(무한 누적 시 저장 한도 초과 위험 → 기각).

## 12. 복합 인덱스 필요 여부

- **Decision**: 등호(`==`) 필터만 여러 개 조합하는 쿼리(예: `batchGrade`의 `quizId ==` +
  `finalStatus ==`)는 Firestore가 단일 필드 인덱스를 자동으로 병합해 처리하므로 별도 복합
  인덱스가 필요 없다. 실제로 복합 인덱스가 필요한 경우는 등호 필터에 범위(`>`/`<`) 또는
  `orderBy`가 함께 쓰일 때뿐이며, 이 프로젝트에서는 `getParticipantOverview`가 `quizId ==`
  조건과 `finalSubmittedAt` 정렬을 함께 쓸 때 1건만 필요하다(data-model.md "필요한 복합
  인덱스" 절 참고).
- **Rationale**: 불필요한 복합 인덱스를 미리 정의하지 않아야 `firestore.indexes.json`이
  실제 쿼리 패턴과 어긋나지 않고, 인덱스 빌드 시간·저장 공간도 아낄 수 있다.

## 13. 참가자 문서 생성 시점 — 최종 제출이 아니라 최초 입장

- **Decision**: `participants/{quizId}_{studentId}` 문서는 최초 최종 제출 시점이 아니라
  `enterQuiz`(최초 입장) 시점에 생성하고, `finalStatus`를 `'IN_PROGRESS'`로 명시적으로
  저장한다.
- **Rationale**: 실행 횟수 카운터(§5)를 참가자 문서의 `runsUsedByProblem` 필드에 두기로
  했으므로, 연습 실행이 시작되는 순간부터 이 문서가 실제로 존재해야 트랜잭션을 걸 수 있다.
  원본 개발 문서(4.1절)의 "존재하지 않는 문서 = 미입장, 최초 제출 시점에 생성" 규칙은 카운터를
  참가자 문서에 두기 전의 설계였으므로 더 이상 유지할 수 없다. 대신 "문서가 없으면 미입장"이라는
  조회 로직은 그대로 유지된다 — 다만 그 문서가 생성되는 시점만 입장으로 앞당겨진다.
- **Alternatives considered**: 카운터를 참가자 문서와 분리한 별도의 "진행 상태" 문서에 두고
  참가자 문서 생성은 최종 제출까지 미루는 방안(문서를 하나 더 늘려 §5의 map 필드 통합 취지와
  §13(submissions/runResults 통합, data-model.md)의 취지에 모두 반하므로 기각).

## 6. 참가자 식별자 위조 방지 (헌법 원칙 I)

- **Decision**: 모든 참가자 관련 Callable Function은 클라이언트가 보낸 `participantId`를
  무시하고, 함수 내부에서 `` `${quizId}_${검증된 studentId}` `` 로 재계산한 값만 사용한다.
- **Rationale**: 스펙 FR과 헌법 원칙 I이 요구하는 "서버가 재계산해 대조" 원칙을 문서ID 결정적
  생성 규칙(원본 개발 문서 4.1절)으로 그대로 구현할 수 있다.

## 7. Google 스프레드시트 아카이브 (FR-037~038)

- **Decision**: Cloud Functions에서 `googleapis`의 Sheets API(`spreadsheets.create` +
  `spreadsheets.values.update`)로 새 스프레드시트를 생성하고, 데이터 종류별로 시트(탭)를 나눠
  기록한다(퀴즈 개요/참가자 및 확정 점수/문항별 채점 결과/제출 코드).
- **Rationale**: 사용자가 명시적으로 요청한 "탭별로 구분된 Google 스프레드시트 파일"을 그대로
  만족하며, 서비스 계정으로 서버 사이드에서 생성하므로 클라이언트가 원본 데이터에 직접 접근할
  필요가 없다(헌법 원칙 III과도 정합).
- **Alternatives considered**: CSV 여러 개로 내보내기(사용자가 명시적으로 "탭별로 구분된 하나의
  스프레드시트 파일"을 요청했으므로 기각).

## 8. 테스트 전략

- **Decision**: Firebase Emulator Suite(Auth+Firestore+Functions)로 Callable Function과
  Firestore 보안 규칙을 통합 테스트하고, Vitest로 순수 로직(점수 합산, 신원 검증, 시각 판단)을
  단위 테스트한다.
- **Rationale**: 별도 유료 스테이징 환경 없이 로컬에서 헌법 원칙 I·II·III·VII(서버 신뢰 경계,
  신원 검증, 쓰기 무결성, 단일 기준 시간)을 검증할 수 있다.

## Open Items (구현 착수 전 확인 필요)

- Grader `/grade` 응답의 런타임 오류 표현 필드명과 개별 테스트케이스 타임아웃 시 `status` 값은
  실제 서버 응답 샘플로 재확인이 필요하다(contracts/grader-api.md Open Items 참고).
- 허용 이메일 도메인(헌법 원칙 II, 예: hoseo.edu) 목록은 Cloud Functions 설정값으로 관리하며,
  구체적인 도메인 문자열은 `/speckit-tasks` 또는 구현 착수 시 확정한다.
