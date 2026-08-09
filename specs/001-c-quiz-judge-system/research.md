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

- **Decision**: Firestore `runTransaction`으로 "남은 횟수 조회 → 0 초과 확인 → 1 차감"을
  원자적으로 수행한다. 트랜잭션 커밋에 성공한 요청만 Grader를 호출한다.
- **Rationale**: 클라이언트가 같은 문항에 실행 요청을 동시에 여러 번 보내도(Clarify Session
  Q4), Firestore 트랜잭션의 낙관적 동시성 제어가 재시도로 정확히 한도를 지킨다. 별도의 락 서버나
  큐를 두지 않아 비용 상한(헌법 IV)과도 충돌하지 않는다.
- **Alternatives considered**: 애플리케이션 레벨 락(Redis 등 별도 인프라)은 무료 운영 목표에
  반하므로 기각. 단순 읽고-쓰기(non-transactional)는 경합 상황에서 초과 실행을 허용하므로
  Clarify 답변(A: 정확히 지켜야 함)과 충돌해 기각.

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
