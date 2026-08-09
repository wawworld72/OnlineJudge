# Contract: Firestore 클라이언트 접근 규칙 요약

`firestore.rules`가 구현할 read/write 허용 범위를 요약한다(헌법 원칙 III의 실제 규칙 매핑).

## 원칙 — 이 규칙이 실제로 무엇을 막고, 무엇을 막지 않는가

- **read 미명시는 "보안 위험"이 아니라 "기능이 깨지는 것"이다**: Firestore 보안 규칙은 기본값이
  전면 거부(deny-by-default)다. 어떤 경로에 규칙을 안 써두면 데이터가 새는 게 아니라, 클라이언트가
  그 경로를 아예 못 읽어서 화면이 비거나 오류가 난다. 그래서 아래 표에 "허용"을 명시해야 하는
  이유는 "안 그러면 위험해서"가 아니라 "의도한 화면 기능이 정상 동작하게 하려면"이다.
- **Admin SDK는 이 규칙을 완전히 우회한다**: Cloud Functions는 Firebase Admin SDK로 Firestore에
  접근하며, Admin SDK는 보안 규칙의 적용 대상이 아니다. 즉 이 표는 **클라이언트 SDK로부터의
  접근만** 규율하며, 서버(Cloud Functions) 쓰기가 올바른지는 이 규칙이 전혀 보장하지 않는다 —
  서버 쓰기의 정확성은 오직 Callable Function 내부 로직(신원 검증, 트랜잭션, 런타임 스키마
  검증)이 책임진다.
- **그럼 "클라이언트 직접 write 금지"는 무엇이 지키는가**: 이건 "클라이언트 SDK에 쓰기 권한을
  안 준다"는 아키텍처가 아니다 — Firebase 클라이언트 설정값(`apiKey`, `projectId`)은 원래
  공개값이라, 누구든 앱 UI를 거치지 않고 브라우저 콘솔에서 Firebase JS SDK를 직접 import해
  `updateDoc()` 같은 호출을 "시도"할 수 있다. 그 시도를 실제로 거부하는 유일한 기술적 장치가
  바로 **이 보안 규칙**이다. "우리 앱 코드는 클라이언트에서 Firestore 쓰기 함수를 호출하지
  않는다"는 코드 작성 관행일 뿐이고, "설령 누가 직접 호출해도 거부된다"는 것이 보안 규칙의
  역할이다 — 이 둘을 같은 것으로 착각하면 나중에 규칙을 허술하게 써도 된다고 오해하게 된다.
- **App Check는 이 표와는 다른 층위의 검증이다**: 이 표는 "이 사용자가 이 문서를 읽거나 쓸
  권한이 있는가"(인가)를 다룬다. Firebase App Check는 "이 요청이 실제로 배포된 우리 웹앱에서
  온 것인가"(요청 출처 검증)를 다루는 별개의 계층이며, 모든 Callable Function 앞단에 추가로
  적용한다(research.md §6). 두 장치는 서로를 대체하지 않고 함께 동작한다.

## 접근 범위

| 컬렉션 | 클라이언트 read | 클라이언트 write |
|---|---|---|
| `students/{studentId}` | 금지 (Callable Function 응답으로만 필요한 값 전달) | 금지 |
| `rosters/**` | 금지 | 금지 |
| `quizzes/{quizId}` | 허용 — `status == 'OPEN'`인 문서만(이 문서엔 정답 필드 자체가 없어 문서 전체 read를 허용해도 안전함) | 금지 |
| `quizzes/{quizId}/problems/{problemId}` | 허용 — 상위 퀴즈가 OPEN이고 `deletedAt == null`일 때만(이 문서에도 정답 필드가 없음, 정답은 `problemSecrets`에만 있음) | 금지 |
| `quizzes/{quizId}/problemSecrets/{problemId}` | **전면 금지** (헌법 III, `items` 배열의 `expected` 노출 방지) | 금지 |
| `participants/{quizId}_{studentId}` 및 그 하위 모든 필드 | **금지** — `enterQuiz`/`practiceRun`/`finalSubmit`/`getMyResult` Callable Function이 이미 학생 본인의 참가자 데이터를 응답으로 돌려주므로 클라이언트 직접 읽기 경로가 필요 없다("조회 경로 단일화"를 학생에게도 동일하게 적용, 인증 이메일→학번 역매핑을 규칙에서 구현할 필요도 없어짐) | 금지 |
| `accessLogs/**` | 금지 | 금지 |
| `archives/{quizId}` | 금지(교사 전용 정보는 Callable Function 응답으로 전달) | 금지 |

**원칙**: 위 표에서 "허용"이 아닌 모든 경로는 기본적으로 `allow read, write: if false;`로
막는다. 교사 화면이 필요로 하는 모든 조회(참가자 현황, 문항 편집 등)와, 학생이 필요로 하는
자신의 참가 데이터 조회(입장/연습 실행/제출/결과)는 모두 클라이언트 SDK 직접 쿠리 대신
Callable Function을 통해서만 제공한다 — 이렇게 하면 역할별로 다른 예외 규칙을 규칙 파일에
추가하지 않고도 헌법 "쓰기 경로 단일화"와 대칭되는 "조회 경로 단일화"를 학생·교사 모두에게
동일하게 적용해 규칙 복잡도를 낮춘다.
