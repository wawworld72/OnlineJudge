# Implementation Plan: C언어 온라인 저지 퀴즈 시스템

**Branch**: `001-c-quiz-judge-system` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-c-quiz-judge-system/spec.md`

## Summary

학생은 출입코드·학번·이름으로 퀴즈에 입장해 문항별로 연습 실행을 반복한 뒤 최종 제출하고, 교사는
퀴즈·문항·테스트케이스를 준비해 배포 전 점검을 거쳐 공개하고, 종료 후 일괄 채점으로 점수를
확정한다. 모든 운영 사이클에서 필수로 Google Classroom과 연동해 수강생 동기화·과제 배포·성적
반영을 수행하며,
더 이상 필요 없는 퀴즈 데이터는 Google 스프레드시트로 아카이브한 뒤 삭제할 수 있다.

기술적으로는 Firebase(Authentication, Firestore, Cloud Functions, Hosting)를 표준 스택으로
하는 정적 프론트엔드 + Callable Functions 백엔드 구조를 채택한다. 모든 신뢰가 필요한 판단(신원,
시간, 점수, 참가자 식별자)은 Cloud Functions 안에서만 이루어지며, 클라이언트는 Firestore에
직접 쓰지 않는다(헌법 원칙 I·III). 채점은 외부 Grader 서비스에 HTTP로 위임하고, 실행 횟수 차감은
Firestore 트랜잭션으로 원자적으로 처리한다(헌법 원칙 IV 비용 상한을 지키기 위해 연습 실행 결과는
저장하지 않고, 실시간 리스너 대신 클라이언트 로컬 카운트다운을 사용한다).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (Cloud Functions 2세대 및 프론트엔드 공용)

**Primary Dependencies**: firebase-admin / firebase-functions(백엔드), googleapis(Google
Classroom API·Google Sheets API 연동), React 18 + Vite(프론트엔드 SPA), CodeMirror 6 +
`@codemirror/lang-cpp`(C 코드 에디터), Firebase JS SDK(Authentication 로그인, Callable
Functions 호출; Firestore 클라이언트 SDK는 조회 전용으로만 사용)

**Storage**: Cloud Firestore (Spark 무료 플랜). 원본 개발 문서의 컬렉션 경로 규칙
(`quizzes/{quizId}/problems/{problemId}/testCases/{tcId}`, `participants/{quizId}_{studentId}`
등)을 그대로 채택 — 자세한 스키마는 data-model.md 참고.

**Testing**: Firebase Emulator Suite(Auth + Firestore + Functions, 무료·로컬)로 Callable
Functions와 Firestore 보안 규칙을 통합 테스트하고, Vitest로 Functions 내부 로직(점수 계산, 신원
검증, 트랜잭션 로직)을 단위 테스트한다.

**Target Platform**: 모던 데스크톱/노트북 웹 브라우저(교실 PC 환경 기준), Firebase Hosting에
정적 배포. 모바일 대응은 이번 기능 범위 밖(스펙 Assumptions 참고).

**Project Type**: Web application (frontend + backend) — Firebase 프로젝트 표준 레이아웃
(`functions/` + Hosting 정적 자산)

**Performance Goals**: 헌법 원칙 V 그대로 채택 — 퀴즈 목록 조회 1초, 입장 2초, 연습 실행 3초,
최종 제출 3초 이내(체감 목표, 지연 시 단계적 UX 필수).

**Constraints**: 헌법 원칙 IV(Firestore Spark 무료 플랜: 일일 읽기 50,000/쓰기 20,000, 저장
1GiB, 월 아웃바운드 10GiB) 안에서 학기 전체 운영. 실시간 리스너(`onSnapshot`) 사용 금지, 연습
실행 결과 영구 저장 금지, 서버 쓰기는 최종 제출 시점 1회로 제한(코드 자동저장은 로컬 저장소만).

**Scale/Scope**: 분반 2개·분반당 50명(총 100명), 학기당 주 1회 × 15주, 퀴즈당 문항 5개 내외.
User Story 6개(P1~P6), 기능 요구사항 40개.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 헌법 원칙 | 이번 설계에서의 준수 방식 |
|---|---|
| I. 서버 신뢰 경계 | 시간·점수·참가자 식별자 판단은 전부 Callable Functions 내부에서 수행. 참가자 문서ID는 클라이언트가 보낸 값이 아니라 `(quizId, 서버가 검증한 studentId)`로 함수 내부에서 재계산해 대조(contracts/callable-functions.md 참고) |
| II. 3중 신원 검증 | 모든 학생 호출 Callable Function 진입점에서 `context.auth.token.email` + 요청의 학번·이름을 학생명부와 대조하는 공통 검증 유틸을 통과해야만 로직이 실행됨 |
| III. 정답 및 상태 무결성 보호 | Firestore 보안 규칙에서 `testCases` 서브컬렉션은 클라이언트 read/write를 전면 차단(Admin SDK만 접근). 참가자·제출·채점 관련 컬렉션은 클라이언트 write 전면 차단, read는 본인 문서만 허용 |
| IV. 무료 운영 비용 상한 | 연습 실행 결과 미저장, 잔여시간 클라이언트 로컬 계산(서버가 준 종료시각 기준), 코드 자동저장은 로컬 저장소, 서버 쓰기는 최종 제출 1회 — Technical Context의 Constraints에 그대로 반영 |
| V. 화면별 응답 시간 목표 | Performance Goals에 원칙 그대로 채택. 지연 UX(진행중→지연안내→재시도)는 프론트엔드 공용 컴포넌트로 구현해 입장·최종제출 두 Callable Function 호출 지점에 재사용 |
| VI. 장애 복원력 있는 오류 처리 | 외부 호출(Grader, Classroom, Sheets) 공용 래퍼에서 1회 자동 재시도 후 실패 시 사용자에게는 일반 안내, 상세는 Cloud Functions 로그(Cloud Logging)에만 기록 |
| VII. 단일 기준 시간 | 모든 시간 판단은 Cloud Functions에서 서버 시각(`Timestamp.now()`) 기준으로 수행. 클라이언트에는 `yyyy-MM-dd HH:mm:ss` 형식의 종료시각만 전달하고 표시용 짧은 형식은 프론트엔드에서만 변환 |

**결과**: 위반 없음. Complexity Tracking 불필요.

**Phase 1 설계 반영 후 재평가**: data-model.md(Firestore 스키마)·contracts/(Callable
Functions, 실제 Grader API, Firestore 접근 규칙)·quickstart.md 작성을 마친 뒤 다시 검토했다.
`testCases` 클라이언트 read 전면 차단(III), 참가자 문서ID 서버 재계산(I), 캐시 키에 문항
`updatedAt` 포함(FR-016/IV), Grader 실패 1회 재시도(VI) 모두 설계에 실제로 반영됐다. 위반 없음.

## Project Structure

### Documentation (this feature)

```text
specs/001-c-quiz-judge-system/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── callable-functions.md
│   ├── grader-api.md
│   └── firestore-access-summary.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
functions/                       # Cloud Functions (TypeScript, Node.js 20)
├── src/
│   ├── callable/                # 각 Callable Function 진입점 (enterQuiz, practiceRun, ...)
│   ├── services/                # grader-client, classroom-client, sheets-client, identity, timeAuthority
│   ├── models/                  # Firestore 문서 타입 정의 (data-model.md 매핑)
│   └── shared/                  # 공용 검증·오류 응답 유틸
└── test/                        # Vitest 단위 테스트 + Emulator 통합 테스트

web/                              # React + Vite SPA (학생/교사 역할별 라우팅)
├── src/
│   ├── student/                 # 퀴즈 목록/입장/풀이 화면
│   ├── teacher/                 # 퀴즈·문항 관리/배포전점검/채점/현황/Classroom/아카이브 화면
│   ├── shared/                  # 로그인, Callable Function 클라이언트, 타이머 유틸
│   └── editor/                  # CodeMirror 6 기반 C 코드 에디터 컴포넌트
└── test/

firestore.rules                  # 헌법 III 클라이언트 read/write 제한 규칙
firestore.indexes.json
firebase.json
```

**Structure Decision**: Firebase 프로젝트 표준 구조(백엔드 `functions/` + 정적 프론트엔드
`web/`)를 채택한다. 학생·교사 화면은 별도 배포 단위가 아니라 하나의 `web/` SPA 안에서 로그인
이메일/역할에 따라 라우팅만 분리한다(별도 앱으로 나누면 Hosting 배포·인증 상태 공유가
불필요하게 복잡해짐).

## Complexity Tracking

> Constitution Check에서 위반이 없으므로 해당 없음.
