# Contract: Firestore 클라이언트 접근 규칙 요약

`firestore.rules`가 구현할 read/write 허용 범위를 요약한다(헌법 원칙 III의 실제 규칙 매핑).
Cloud Functions는 Admin SDK로 동작하므로 이 규칙의 영향을 받지 않는다 — 클라이언트 SDK에만
적용된다.

| 컬렉션 | 클라이언트 read | 클라이언트 write |
|---|---|---|
| `students/{studentId}` | 금지 (Callable Function 응답으로만 필요한 값 전달) | 금지 |
| `rosters/**` | 금지 | 금지 |
| `quizzes/{quizId}` | 허용 — `status == 'OPEN'`인 문서만, 정답 없는 필드(제목/기간/설명/상태)만 | 금지 |
| `quizzes/{quizId}/problems/{problemId}` | 허용 — 설명/초기코드/순서 등 정답 없는 필드만, 상위 퀴즈가 OPEN일 때만 | 금지 |
| `quizzes/{quizId}/problems/{problemId}/testCases/{tcId}` | **전면 금지** (헌법 III, expected 노출 방지) | 금지 |
| `participants/{quizId}_{studentId}` | 본인 문서만 허용 (`request.auth`로 도출한 studentId와 문서ID가 일치할 때만) | 금지 |
| `participants/.../submissions/{problemId}` | 본인 문서만 허용 | 금지 |
| `participants/.../runResults/{problemId}` | 본인 문서만 허용 | 금지 |
| `accessLogs/**` | 금지 | 금지 |
| `archives/{quizId}` | 금지(교사 전용 정보는 Callable Function 응답으로 전달) | 금지 |

**원칙**: 위 표에서 "허용"이 아닌 모든 경로는 기본적으로 `allow read, write: if false;`로
막는다. 교사 화면이 필요로 하는 모든 조회(참가자 현황, 문항 편집 등)는 클라이언트 SDK 직접
쿠리 대신 Callable Function(`getParticipantOverview`, `getParticipantDetail` 등)을 통해서만
제공한다 — 이렇게 하면 "교사는 전체 조회 가능"이라는 예외를 규칙에 추가하지 않고도 헌법
"쓰기 경로 단일화"와 대칭되는 "조회 경로 단일화"를 유지해 규칙 복잡도를 낮춘다.
