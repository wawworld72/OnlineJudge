import { getGraderConfig } from "../config";
import { retryOnce } from "../shared/retryOnce";
import { systemError } from "../shared/errors";
import { logger } from "firebase-functions/v2";
import type { RunResult, TestCase, TestCaseResult } from "../models/types";

interface GraderWireTestCase {
  id: string;
  input: string;
  expected: string;
}

/**
 * 실제 배포된 Grader가 돌려주는 모양(2026-08-11 Cloud Logging으로 실측 확인) — `id`/
 * `passed` 필드가 없고, 요청에 보낸 `testCases`와 같은 순서로 결과 배열을 돌려준다. `earned`는
 * 요청에 `points`를 안 보냈을 때 항상 0으로 오므로(실제 출력이 기대 출력과 완전히 같아도
 * earned:0 — 실측으로 확인) 신뢰하지 않는다. 통과 여부는 `result`(`"✅PASS"`/`"❌FAIL"`류
 * 문자열)로 판단한다. `isPublic`도 Grader가 항상 `false`로 채워 보내므로(요청에 안 넘기니
 * 당연히 기본값) 신뢰하지 않고, 우리가 저장한 `items[].isPublic`을 그대로 쓴다.
 */
interface GraderTcResult {
  result: string;
  earned: number;
  isPublic: boolean;
  input: string;
  actual: string;
  expected: string;
  memo: string;
}

interface GraderWireResultOk {
  ok: true;
  status: "JUDGED" | "COMPILE_ERROR";
  score: number;
  maxScore: number;
  compileErrorMessage: string | null;
  tcResultsFull: GraderTcResult[];
}

interface GraderWireResultError {
  ok: false;
  error: string;
}

type GraderWireResult = GraderWireResultOk | GraderWireResultError;

const DEFAULT_TIME_LIMIT_SEC = 2;
const DEFAULT_MEM_LIMIT_KB = 65536;

async function callGraderOnce(code: string, testCases: GraderWireTestCase[]): Promise<GraderWireResultOk> {
  const { serviceUrl, authToken } = getGraderConfig();
  const res = await fetch(`${serviceUrl}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": authToken },
    body: JSON.stringify({
      code,
      testCases,
      timeLimitSec: DEFAULT_TIME_LIMIT_SEC,
      memLimitKb: DEFAULT_MEM_LIMIT_KB,
    }),
  });

  if (!res.ok) {
    throw new Error(`Grader responded with HTTP ${res.status}`);
  }

  const body = (await res.json()) as GraderWireResult;
  if (!body.ok) {
    throw new Error(body.error);
  }
  return body;
}

function buildRunResult(response: GraderWireResultOk, items: TestCase[]): RunResult {
  const maxScore = items.reduce((sum, item) => sum + item.points, 0);

  if (response.status === "COMPILE_ERROR") {
    return {
      status: "CE",
      score: 0,
      maxScore,
      compileErrorMessage: response.compileErrorMessage,
      tcResults: [],
    };
  }

  if (response.tcResultsFull.length !== items.length) {
    logger.warn("graderClient: tcResultsFull length doesn't match the number of test cases sent", {
      sent: items.length,
      received: response.tcResultsFull.length,
    });
  }

  let score = 0;
  const tcResults: TestCaseResult[] = items.map((item, index) => {
    const result = response.tcResultsFull[index];
    const passed = (result?.result ?? "").includes("PASS");
    if (passed) score += item.points;

    return item.isPublic && result
      ? {
          tcId: item.tcId,
          passed,
          isPublic: true,
          points: item.points,
          input: result.input,
          expectedOutput: result.expected,
          actualOutput: result.actual,
          ...(result.memo ? { memo: result.memo } : {}),
        }
      : { tcId: item.tcId, passed, isPublic: item.isPublic, points: item.points };
  });

  return {
    status: score === maxScore ? "AC" : "WA",
    score,
    maxScore,
    compileErrorMessage: null,
    tcResults,
  };
}

/**
 * 문항의 `problemSecrets.items`를 그대로 넘겨 Grader를 호출하고, 비공개 테스트케이스를
 * 마스킹한 `RunResult`로 변환한다. 점수는 Grader의 `score`를 신뢰하지 않고 이 문항의
 * 배점(`items[].points`) 기준으로 여기서 재계산한다(헌법 원칙 I).
 */
export async function grade(items: TestCase[], code: string): Promise<RunResult> {
  const testCases: GraderWireTestCase[] = items.map((item) => ({
    id: item.tcId,
    input: item.input,
    expected: item.expected,
  }));

  try {
    const response = await retryOnce(() => callGraderOnce(code, testCases));
    return buildRunResult(response, items);
  } catch (cause) {
    throw systemError("graderClient.grade", cause);
  }
}
