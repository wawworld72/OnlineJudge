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
  별도 문서에 두는 방안은, 참가자 문서 자체를 map 필드로 통합하기로 한 결정(§10, data-model.md)과
  일관되지 않고 트랜잭션 대상 문서를 하나 더 늘리므로 기각.

## 6. 부정 사용 방지 계층 — Firebase App Check

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

## 7. Firestore 스키마 미강제 → 런타임 검증

- **Decision**: Cloud Functions 내부에서 Zod로 모든 Callable Function 입력과, Firestore에
  쓰기 전 최종 객체 형태를 런타임 검증한다.
- **Rationale**: Firestore는 관계형 DB와 달리 스키마를 강제하지 않는다 — 오타가 있는 필드나
  값(예: `finalStatus: 'SUMBITTED'`)도 에러 없이 그대로 저장된다. TypeScript의 타입 검사는
  컴파일 타임에만 유효하므로, data-model.md가 정의한 열거형·필수 필드를 실제로 강제하는 책임은
  런타임 검증 라이브러리가 져야 한다.
- **Alternatives considered**: 검증 없이 TypeScript 타입에만 의존(런타임에 잘못된 값이 조용히
  저장될 위험을 방치하므로 기각).

## 8. accessLogs 저장 공간 관리 — Firestore 네이티브 TTL

- **Decision**: `accessLogs.expiresAt`(작성 시각 + 6개월)에 Firestore TTL 정책을 설정해 만료된
  로그를 자동 삭제한다.
- **Rationale**: `accessLogs`는 15주 내내 계속 누적되는 유일한 무제한 증가 컬렉션이다. 6개월은
  한 학기(약 15주)와 성적 이의제기 대응 기간을 합친 여유를 두면서도, Firestore 무료 저장
  한도(1GiB, 헌법 IV)를 별도 수동 정리 없이 지킬 수 있게 한다. 퀴즈 단위 아카이브(User Story
  6)와는 별개로, accessLogs는 퀴즈에 종속되지 않는 전역 로그이므로 자체 TTL이 필요하다.
- **Alternatives considered**: 수동 정리 배치 작업(별도 스케줄러 인프라 필요 → 무료 운영
  목표와 충돌해 기각). TTL 없음(무한 누적 시 저장 한도 초과 위험 → 기각).

## 9. 복합 인덱스 필요 여부

- **Decision**: 등호(`==`) 필터만 여러 개 조합하는 쿼리(예: `batchGrade`의 `quizId ==` +
  `finalStatus ==`)는 Firestore가 단일 필드 인덱스를 자동으로 병합해 처리하므로 별도 복합
  인덱스가 필요 없다. 실제로 복합 인덱스가 필요한 경우는 등호 필터에 범위(`>`/`<`) 또는
  `orderBy`가 함께 쓰일 때뿐이며, 이 프로젝트에서는 `getParticipantOverview`가 `quizId ==`
  조건과 `finalSubmittedAt` 정렬을 함께 쓸 때 1건만 필요하다(data-model.md "필요한 복합
  인덱스" 절 참고).
- **Rationale**: 불필요한 복합 인덱스를 미리 정의하지 않아야 `firestore.indexes.json`이
  실제 쿼리 패턴과 어긋나지 않고, 인덱스 빌드 시간·저장 공간도 아낄 수 있다.

## 10. 참가자 문서 생성 시점 — 최종 제출이 아니라 최초 입장

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
  §10(submissions/runResults 통합, data-model.md)의 취지에 모두 반하므로 기각).

## 11. 참가자 식별자 위조 방지 (헌법 원칙 I)

- **Decision**: 모든 참가자 관련 Callable Function은 클라이언트가 보낸 `participantId`를
  무시하고, 함수 내부에서 `` `${quizId}_${검증된 studentId}` `` 로 재계산한 값만 사용한다.
- **Rationale**: 스펙 FR과 헌법 원칙 I이 요구하는 "서버가 재계산해 대조" 원칙을 문서ID 결정적
  생성 규칙(원본 개발 문서 4.1절)으로 그대로 구현할 수 있다.

## 12. Google 스프레드시트 아카이브 (FR-037~038)

- **Decision**: Cloud Functions에서 `googleapis`의 Sheets API(`spreadsheets.create` +
  `spreadsheets.values.update`)로 새 스프레드시트를 생성하고, 데이터 종류별로 시트(탭)를 나눠
  기록한다(퀴즈 개요/참가자 및 확정 점수/문항별 채점 결과/제출 코드).
- **Rationale**: 사용자가 명시적으로 요청한 "탭별로 구분된 Google 스프레드시트 파일"을 그대로
  만족하며, 서비스 계정으로 서버 사이드에서 생성하므로 클라이언트가 원본 데이터에 직접 접근할
  필요가 없다(헌법 원칙 III과도 정합).
- **Alternatives considered**: CSV 여러 개로 내보내기(사용자가 명시적으로 "탭별로 구분된 하나의
  스프레드시트 파일"을 요청했으므로 기각).

## 13. 연습 실행 결과 캐시 — TTL과 키 구성 (FR-016)

- **Decision**: 캐시 키는 `(quizId, problemId, code, problems.updatedAt)` 4요소 조합이며,
  TTL은 5분이다. 두 요소의 역할은 서로 다르다 — **키에 `problems.updatedAt`이 포함되는 것이
  정확성을 보장하는 핵심**이고, TTL은 그 위에 얹는 성능/비용 파라미터일 뿐이다.
  - `updatedAt`이 키에 있으므로: 교사가 테스트케이스나 배점을 수정하는 순간
    `problems.updatedAt`이 바뀌고(§"pointsTotal/updatedAt의 소유권", data-model.md), 기존
    캐시 항목은 키 자체가 달라져 더 이상 조회되지 않는다 — 즉 "수정 직후 5분 이내에 재실행하는
    학생이 오래된 결과를 받는" 문제는 TTL과 무관하게 이미 차단된다.
  - TTL(5분)이 없다면: 같은 코드를 반복 제출하는 캐시 항목이 문항 수정 없이도 무기한 남아,
    헌법 원칙 IV "연습 실행 결과는 서버에 영구 저장하지 않는다"의 취지(유사 영구 저장으로
    변질되는 것 방지)를 벗어난다. 5분은 "같은 코드로 짧게 반복 실행"하는 실제 사용 패턴을
    포괄하면서도 무기한 보관을 막는 값으로, 원본 개발 문서 8절의 예시값을 그대로 채택했다.
- **저장 위치**: Firestore 대신 이 캐시 자체는 Cloud Functions 인스턴스의 메모리 캐시 또는
  단명 TTL 컬렉션(예: `practiceRunCache/{cacheKeyHash}`에 `expiresAt`을 두고 TTL 정책 적용,
  §8과 같은 방식)으로 구현한다 — 어느 쪽이든 "영구 저장"이 되지 않도록 반드시 만료 메커니즘을
  둔다.
- **Rationale**: 캐시 키에 콘텐츠 버전(`updatedAt`)을 포함하는 것과, 그 캐시 자체를 시간이
  지나면 지우는 것은 서로 다른 문제(정확성 vs. 저장 공간)를 풀기 위한 것이며, 둘 다 필요하다.
  TTL 숫자만 정하고 키 구성을 정하지 않으면 "교사가 막 고친 테스트케이스를 오래된 캐시로
  채점하는" 정확성 문제가 남고, 키 구성만 정하고 TTL을 안 두면 "무기한 쌓이는 캐시"가 헌법
  IV의 취지를 벗어난다.
- **Alternatives considered**: TTL만 두고 키에서 `updatedAt` 제외(교사가 테스트케이스를 고친
  직후 짧은 시간 안에는 오래된 결과가 재사용될 수 있어 FR-016의 "수정 후에는 재사용하지 않아야
  한다" 요건과 직접 충돌 → 기각). TTL 없이 무기한 캐시(헌법 IV 위반 소지 → 기각).

## 14. 테스트 전략

- **Decision**: Firebase Emulator Suite(Auth+Firestore+Functions)로 Callable Function과
  Firestore 보안 규칙을 통합 테스트하고, Vitest로 순수 로직(점수 합산, 신원 검증, 시각 판단)을
  단위 테스트한다.
- **Rationale**: 별도 유료 스테이징 환경 없이 로컬에서 헌법 원칙 I·II·III·VII(서버 신뢰 경계,
  신원 검증, 쓰기 무결성, 단일 기준 시간)을 검증할 수 있다.

## 15. `batchGrade`의 100명 규모 처리 (SC-004)

- **Decision**: `batchGrade`는 대상 참가자를 동시성 상한(잠정 10)을 둔 청크로 나눠 순차
  처리하고(청크 내부는 `Promise.all`, 청크 간은 순차), Cloud Functions는 2세대로 배포해
  `batchGrade`의 `timeoutSeconds`를 넉넉히(잠정 540초) 설정한다.
- **Rationale**: 최악의 경우 미확정 참가자 100명 × 문항 5개 = 최대 500회의 Grader 호출이
  **하나의 Callable Function 실행 안에서** 발생한다. 순차 호출만 쓰면 기본 타임아웃(대개
  60초)을 쉽게 넘기고, 동시성 제한 없는 완전 병렬 호출은 Grader에 순간적으로 수백 개 요청을
  몰아 Grader 자체의 처리 한도를 넘길 위험이 있다. SC-004("일괄 채점 한 번의 실행으로 미확정
  참가자 전원 처리")는 설계 문서 검토만으로는 충족 여부를 확인할 수 없고, 이 동시성 상한·
  타임아웃 값이 실제로 충분한지는 구현 착수 후 Grader의 실측 응답 시간을 근거로 재조정해야
  한다(Open Items 참고) — 지금 단계에서 확정할 수 있는 것은 "무제한 순차/무제한 병렬 둘 다
  기각하고 상한 있는 배치 처리를 채택한다"는 아키텍처 방향뿐이다.
- **Alternatives considered**: 완전 병렬 호출(동시성 제한 없이 `Promise.all` 전체 실행) —
  Grader 서비스에 순간 최대 500개 동시 요청이 몰릴 수 있어 기각. Cloud Tasks 등 비동기 작업
  큐로 분리 — 이 규모(100명, 학기당 15회)에는 과한 인프라이고 무료 운영 목표에 부담을 줄 수
  있어 기각(단, 실측 결과 동시성 상한+타임아웃 확장으로도 부족하면 재검토 대상).

## 16. 콜드 스타트가 응답 시간 목표(SC-001~003)를 위협하지 않도록 모듈 경계 분리

- **Decision**: `googleapis`(Classroom·Sheets 연동용, 무거운 라이브러리)를 임포트하는 코드는
  `classroomClient.ts`/`sheetsClient.ts`와 그것을 호출하는 Callable Function
  (`syncRoster`/`classroomAssignment`/`pushGrades`/`archiveQuiz`)에만 존재해야 하며,
  학생이 실제로 호출하는 함수(`enterQuiz`/`practiceRun`/`finalSubmit`/`getMyResult`)나 그
  함수들이 의존하는 공용 모듈(`functions/src/shared/*`, `functions/src/models/types.ts`)은
  `googleapis`를 직접·간접적으로 임포트하지 않는다. `minInstances`(상시 warm 인스턴스)는
  설정하지 않는다.
- **Rationale**: Cloud Functions는 함수별로 독립적으로 콜드 스타트되며, 콜드 스타트 시간은
  그 함수가 로드하는 모듈 크기에 비례한다. `googleapis`는 번들이 커서, 학생용 함수가 이를
  같은 콜드 스타트 경로에 함께 로드하면 SC-001(1초)·SC-002(2초) 목표를 첫 요청에서 넘기기
  쉽다. `minInstances`로 항상 웜 상태를 유지하는 방법도 있지만 이는 사용량과 무관하게 계속
  비용이 발생해 헌법 원칙 IV(무료 운영)와 충돌하므로 채택하지 않는다 — 대신 모듈 경계를
  분리해 콜드 스타트 자체의 비용(로드 시간)을 줄이는 쪽을 택한다. 첫 요청의 남은 지연은
  헌법 원칙 V가 이미 요구하는 단계적 지연 안내 UX(진행 중 표시 → 지연 안내, T020/T042)로
  사용자 경험을 보완한다.
- **Alternatives considered**: `minInstances` 설정(상시 비용 발생 → 헌법 IV 위반 소지로
  기각). 모든 Callable Function을 하나의 번들로 배포(단순하지만 학생 경로에 Classroom/Sheets
  의존성이 항상 같이 로드되어 기각).

## 17. 교사(관리자) 판별 — 구현 중 식별된 누락 항목

- **Decision**: 교사용 Callable Function은 시작 시 로그인 이메일(`context.auth.token.email`)을
  별도 환경 변수 허용 목록(`TEACHER_EMAILS`, `config.ts`)과 대조하는 공통 가드
  (`shared/authorization.ts`의 `requireTeacher`)를 통과해야 한다. 프론트엔드
  `App.tsx`의 역할 라우팅(어떤 화면을 보여줄지)도 동일한 목록을 참조하지만, 이는 UX
  분기일 뿐 보안 경계가 아니다 — 실제 권한 검증은 항상 서버(Callable Function 내부)에서
  수행한다(헌법 원칙 I).
- **Rationale**: contracts/callable-functions.md가 정의한 "교사용" 함수들은 모두
  `enforceAppCheck: true` + 로그인 필요만 명시했을 뿐, "이 로그인 사용자가 실제로
  교사인가"를 판별하는 방법이 문서에 없었다 — 학생명부(`students`) 소속 여부로 "교사 = 명부에
  없는 계정"이라 추론하는 방법도 검토했으나, 아직 명부에 등록되지 않은 학생(동기화 지연 등)을
  교사로 오판할 위험이 있어 기각했다. 이 프로젝트의 운영 규모(헌법 "운영 규모 및 범위 가정" —
  분반 2개, 교사 1인 내외)에서는 고정 허용 목록이 가장 단순하고 오판 위험이 없다.
- **Alternatives considered**: Firebase Custom Claims(계정 생성 시 관리자가 수동으로
  설정) — 이 규모에서는 별도 프로비저닝 스크립트를 추가하는 비용이 허용 목록보다 크다고
  판단해 기각(향후 교사가 여러 명으로 늘어나면 재검토 대상).

## 18. 교사의 퀴즈 목록/편집 조회 경로 — 구현 중 식별된 누락 항목

- **Decision**: `listQuizzes`(교사가 접근 가능한 전체 퀴즈의 `deletedAt == null` 목록,
  `DRAFT`/`OPEN`/`CLOSED` 모두 포함)와 `getQuizForEdit`(퀴즈 전체 필드 + 삭제되지 않은
  문항 + 문항별 `problemSecrets.items`를 한 번에 반환)를 신규 Callable Function으로
  추가한다. 둘 다 `requireTeacher` 가드를 통과해야 한다(research.md §17).
- **Rationale**: firestore.rules는 `quizzes`/`problems`의 클라이언트 직접 read를
  `status == 'OPEN'`(학생용 시나리오)일 때만 허용한다 — 교사가 편집해야 하는 `DRAFT`
  퀴즈나 이미 끝난 `CLOSED` 퀴즈는 이 경로로 읽을 수 없다. 그런데
  contracts/callable-functions.md의 "교사용 — 준비" 절은 `upsertQuiz`/`upsertProblem`/
  `upsertTestCase` 등 **쓰기** 함수만 정의했을 뿐, 교사가 "무엇을 편집할지 고르기 위해
  먼저 조회하는" 경로가 문서에 전혀 없었다 — QuizManager/ProblemEditor 화면을 만들면서
  발견한 누락이다. `getQuizForEdit`이 문항별 `problemSecrets.items`(정답 포함)까지
  함께 반환하는 것은 의도적이다 — 교사에게는 애초에 정답을 감출 이유가 없고(헌법 III은
  "학생에게" 정답을 숨기는 원칙), 왕복 횟수를 줄이기 위해 문항 편집에 필요한 모든 데이터를
  한 번에 담는다.
- **Alternatives considered**: `quizzes`/`problems`에 "작성자(교사) 본인이면 상태 무관
  read 허용" firestore.rules 예외를 추가하는 방법도 검토했으나, 이 프로젝트에 교사 계정을
  문서 필드로 저장해 두는 곳이 없어(교사 판별 자체가 `TEACHER_EMAILS` 환경변수 허용
  목록뿐, §17) 규칙에서 "이 요청자가 교사인가"를 판단할 방법이 없다 — Callable Function
  경로가 이 판별을 이미 갖고 있으므로(`requireTeacher`) 그대로 재사용하는 쪽을 택했다.

## 19. `classroomGradesPending` 판단에 필요한 참가자별 반영 여부 필드 — 구현 중 식별된 누락 항목

- **Decision**: `participants/{quizId}_{studentId}`에 `gradePushedAt: timestamp | null`
  필드를 추가한다. `pushGrades`(User Story 5)가 이 참가자의 성적을 Classroom에 성공
  반영하면 이 필드를 서버 시각으로 채우고, `batchGrade`는 응답 직전에 "이 퀴즈에
  `FINALIZED`인데 `gradePushedAt == null`인 참가자가 있는가"로 `classroomGradesPending`을
  계산한다.
- **Rationale**: `batchGrade`의 계약(contracts/callable-functions.md)은 이미
  "`FINALIZED` 참가자 중 아직 `pushGrades`가 성공한 적 없는 인원이 있는지 확인해
  `classroomGradesPending`을 채운다"고 서술하고 있었지만, "성공한 적 없음"을 판단할 근거
  데이터가 data-model.md 어디에도 없었다 — `pushGrades`가 무언가를 기록하지 않으면 이
  판단 자체가 불가능하다. `batchGrade`(T061)를 구현하며 발견했다.
- **Alternatives considered**: 퀴즈 문서에 "마지막으로 성적을 반영한 시각" 단일 필드만
  두는 방법도 검토했으나, `pushGrades`가 일부 참가자만 실패할 수 있어(응답 스키마에
  `failedStudentIds`가 있음) 퀴즈 단위 하나의 시각으로는 "그때 실패한 참가자가 이후 재시도로
  성공했는지"를 구분할 수 없다 — 참가자별 필드가 필요하다.

## 20. `getParticipantOverview`의 "대상 학생 전원" 판단 — 구현 중 식별된 누락 항목

- **Decision**: `quizzes.courseId`가 있으면 `rosters`에서 `courseId ==` 조회로 "대상 학생
  전원" 목록을 얻고, 각 수강생을 `participants` 조회 결과와 매칭한다 — 매칭되는 참가자
  문서가 없으면 상태를 `'NOT_ENTERED'`(미입장)로 채운다. `courseId`가 없는 퀴즈(분반
  미연동)는 "전원"을 판단할 명부 자체가 없으므로, 이미 입장한 참가자만 반환한다(미입장
  학생은 애초에 나열할 근거 데이터가 없음).
- **Rationale**: FR-025는 "대상 학생 전원의 응시 상태(**미입장**/응시중/제출완료/채점완료)"를
  요구하지만, `participants` 컬렉션은 입장한 학생만 문서를 갖는다(§10) — 미입장 학생은
  이 컬렉션에 아예 나타나지 않으므로, "전원" 목록의 기준이 되는 별도 명부(`rosters`)가
  필요하다는 것이 `getParticipantOverview`(T067) 구현 중 드러났다. `rosters`는 이미
  `name`/`email` 스냅샷을 갖고 있어(data-model.md) 별도로 `students`를 조회하지 않고도
  이름을 채울 수 있다.
- **정렬과의 상호작용**: T023의 복합 인덱스(`participants`의 `quizId ASC, finalSubmittedAt
  ASC`)는 여전히 "이미 입장한 참가자" 조회에 그대로 쓰인다 — `finalSubmittedAt`이 없는
  `IN_PROGRESS` 참가자는 오름차순 정렬에서 자연히 맨 앞에 온다(Firestore는 null을 가장
  작은 값으로 정렬). `NOT_ENTERED` 항목은 이 정렬된 결과 뒤에 이어 붙인다 — 인덱스가
  다루는 대상이 아니므로 별도 정렬 기준(이름 등)을 적용해도 무방하다.

## Open Items (구현 착수 전 확인 필요)

- Grader `/grade` 응답의 런타임 오류 표현 필드명과 개별 테스트케이스 타임아웃 시 `status` 값은
  실제 서버 응답 샘플로 재확인이 필요하다(contracts/grader-api.md Open Items 참고).
- 허용 이메일 도메인(헌법 원칙 II, 예: hoseo.edu) 목록은 Cloud Functions 설정값으로 관리하며,
  구체적인 도메인 문자열은 `/speckit-tasks` 또는 구현 착수 시 확정한다.
- Grader 1회 호출의 실제 응답 시간(§15 관련) — 구현 착수 후 소수 샘플로 실측하고, 그 값에
  맞춰 `batchGrade`의 동시성 상한(잠정 10)과 `timeoutSeconds`(잠정 540)를 조정한다. SC-004의
  100명 규모 처리가 실제로 타임아웃 없이 끝나는지는 이 실측 없이는 확인할 수 없다.
- SC-001~003(응답 시간 목표) 실측(§16 관련) — Firebase Emulator Suite는 실제 배포 환경의
  콜드 스타트·네트워크 지연을 반영하지 않으므로, 목표 충족 여부는 **실제 Firebase 프로젝트에
  배포한 뒤** 콜드 스타트 1회 + 웜 상태 반복 요청을 각각 측정해야 확인할 수 있다. 에뮬레이터
  측정치는 하한선(이보다 느릴 수만 있음)으로만 참고한다.
