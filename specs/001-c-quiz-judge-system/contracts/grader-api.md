# Contract: Cloud Functions ↔ 외부 채점 서비스 (Grader)

기존에 운영 중인 외부 Grader 서버와의 실제 계약이다(Clarify 후속 확인, 2026-08-09). 참고로
공유받은 호출 예시는 Google Apps Script였지만, 이 시스템의 백엔드는 Firebase Cloud Functions
(TypeScript)로 확정되었다 — Cloud Functions가 동일한 요청/응답 계약으로 이 Grader를 호출한다.

## 연결 정보

- **Base URL**: 환경 변수 `GRADER_SERVICE_URL` (Cloud Functions 환경 설정으로 주입, 코드에
  하드코딩하지 않는다)
- **Auth**: 환경 변수 `GRADER_AUTH_TOKEN`을 요청 헤더 `X-Auth-Token`으로 전달

## `POST {GRADER_SERVICE_URL}/grade` (Cloud Functions → Grader, 동기 호출)

### Request

```json
{
  "code": "string",
  "testCases": [
    { "id": "tc1", "input": "string", "expected": "string" }
  ],
  "timeLimitSec": 2,
  "memLimitKb": 65536
}
```

- `timeLimitSec`(초), `memLimitKb`(KB) 단위 — 문항별 커스텀 제한값이 필요해지면 이 필드에
  문항 설정값을 매핑한다(현재 스펙에는 문항별 시간/메모리 제한이 없으므로 고정값 2초/64MB를
  기본값으로 사용).
- `code`에는 언어를 별도로 명시하지 않는다(이 Grader는 C 전용으로 가정).
- **테스트케이스 필드명은 `expected`다** — 처음 이 문서를 작성할 때는 `expectedOutput`으로
  추정했으나, 실제 배포된 Grader에 호출해 확인한 결과 `expected`가 아니면 기대출력을 못
  받아 항상 실패로 채점된다(2026-08-11, Cloud Logging으로 실측). `id`는 Grader가 응답에서
  그대로 안 쓰므로(아래 참고) 넘겨도 무해하지만 매칭에는 쓰이지 않는다.

### Response — HTTP 200, 정상 처리

```json
{
  "ok": true,
  "status": "JUDGED",
  "score": 80,
  "maxScore": 100,
  "compileErrorMessage": null,
  "tcResultsFull": [
    {
      "result": "✅PASS",
      "earned": 20,
      "isPublic": false,
      "input": "string",
      "expected": "string",
      "actual": "string",
      "memo": ""
    }
  ]
}
```

- **`tcResultsFull`의 개별 항목에는 `id`/`passed` 필드가 없다** — 요청에 보낸 `testCases`와
  **같은 순서(배열 인덱스)**로만 대응된다. Cloud Functions는 `id`로 매칭하지 않고
  `items[index]`로 순서를 맞춘다(`functions/src/services/graderClient.ts`).
- 개별 테스트케이스의 통과 여부는 `earned > 0`으로 판단한다(`passed` boolean이 없음).
  `result`는 사람이 읽는 표시용 문자열(예: `"✅PASS"`/`"❌FAIL"`)이라 파싱에 쓰지 않는다.
- `isPublic`은 Grader가 항상 자체 기본값(`false`)으로 채워 보낸다 — 요청에 공개 여부를
  넘기지 않기 때문이며, Cloud Functions는 이 값을 신뢰하지 않고 자신이 갖고 있는
  `problemSecrets.items[].isPublic`을 그대로 쓴다.
- 응답의 `input`/`expected`/`actual` 필드명도 요청과 마찬가지로 `expectedOutput`/
  `actualOutput`이 아니라 `expected`/`actual`이다.
- Grader가 테스트케이스별 배점을 이미 알고 있다고 가정하지 않는다 — 배점(`points`)은 Cloud
  Functions가 요청에 넘긴 `testCases`와 같은 순서의 `tcResultsFull`을 대조해 자체적으로
  재계산한다(Grader의 `score`/`maxScore`/`earned`는 참고용으로만 로그에 남기고, 학생에게
  전달하는 최종 점수는 Cloud Functions가 문항 배점 기준으로 재계산한 값을 사용한다 — 헌법
  원칙 I).
- `status`는 최소 `JUDGED`(정상 채점) / `COMPILE_ERROR`(컴파일 실패) 값을 사용한다. 컴파일
  실패 시 `tcResultsFull`은 빈 배열이고 `compileErrorMessage`에 메시지가 담긴다.

### Response — HTTP 200이지만 `ok: false`, 또는 HTTP 비-200

Cloud Functions는 이 경우를 시스템 오류로 간주한다:

```json
{ "ok": false, "error": "string" }
```

헌법 원칙 VI에 따라 1회 자동 재시도하고, 재시도까지 실패하면 호출한 Callable Function에
`SYSTEM_ERROR`로 전파한다(연습 실행은 사용자에게 일반 오류 안내, 일괄 채점은 해당 참가자를
"실패"로 집계 — FR-023).

## 비공개 테스트케이스 처리

이 계약에는 `isPublic` 여부를 넘기지 않는다 — Grader는 어떤 테스트케이스가 비공개인지 알 필요가
없다. 마스킹은 Cloud Functions가 `tcResultsFull`을 받은 뒤, 비공개 테스트케이스면
`input`/`expectedOutput`/`actualOutput`을 제거하고 `passed`만 클라이언트에 전달하는 방식으로
수행한다(헌법 원칙 III, data-model.md의 `runResults.tcResults` 참고).

## 연습 실행 결과 캐시 (FR-016)

Cloud Functions는 `(quizId, problemId, code, 문항의 updatedAt)`으로 캐시 키를 만들어, 같은
코드로의 반복 실행 시 Grader를 다시 호출하지 않고 캐시된 결과를 재사용한다. **`SYSTEM_ERROR`
결과는 캐시하지 않는다** — 컴파일 오류(`COMPILE_ERROR`)를 포함한 그 외 결과는 캐시한다(일시적
장애로 인한 오류가 반복 재사용되는 것을 막기 위함). 캐시 재사용 시 실행 횟수를 차감하지 않고
클라이언트에 `usedCache: true`로 표시한다(callable-functions.md `practiceRun` 참고).

## Open Items

- `tcResultsFull`의 런타임 오류 표현 필드명(예: `runtimeError`, `stderr` 등)과 개별 테스트케이스
  타임아웃 시의 `status` 값은 실제 Grader 서버의 응답 샘플로 재확인이 필요하다 — 구현 착수 전
  실제 호출 1회로 확인하고 이 문서를 갱신한다.
- `GRADER_SERVICE_URL`/`GRADER_AUTH_TOKEN`의 실제 값은 배포 환경(Firebase Functions 환경
  변수 또는 Secret Manager)에 별도로 등록하며, 이 저장소에는 값을 남기지 않는다.
