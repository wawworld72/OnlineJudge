import { getGraderConfig } from "../config";
import { retryOnce } from "../shared/retryOnce";
import { systemError } from "../shared/errors";
import { logger } from "firebase-functions/v2";
import type { RunResult, TestCase, TestCaseResult } from "../models/types";

interface GraderWireTestCase {
  id: string;
  input: string;
  expectedOutput: string;
}

interface GraderWireResultOk {
  ok: true;
  status: "JUDGED" | "COMPILE_ERROR";
  score: number;
  maxScore: number;
  compileErrorMessage: string | null;
  tcResultsFull: Array<{
    id: string;
    passed: boolean;
    input: string;
    expectedOutput: string;
    actualOutput: string;
  }>;
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
  const itemsById = new Map(items.map((item) => [item.tcId, item]));
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

  let score = 0;
  const tcResults: TestCaseResult[] = response.tcResultsFull.map((result) => {
    const item = itemsById.get(result.id);
    if (!item) {
      logger.warn("graderClient: tcResultsFull.id has no matching tcId — check the Grader's echoed id format", {
        receivedId: result.id,
        knownTcIds: items.map((i) => i.tcId),
      });
    }
    const points = item?.points ?? 0;
    const isPublic = item?.isPublic ?? false;
    if (result.passed) score += points;

    return isPublic
      ? {
          tcId: result.id,
          passed: result.passed,
          isPublic,
          input: result.input,
          expectedOutput: result.expectedOutput,
          actualOutput: result.actualOutput,
        }
      : { tcId: result.id, passed: result.passed, isPublic };
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
 * 마스킹한 `RunResult`로 변환한다(contracts/grader-api.md). 점수는 Grader의 `score`를
 * 신뢰하지 않고 이 문항의 배점(`items[].points`) 기준으로 여기서 재계산한다(헌법 원칙 I).
 */
export async function grade(items: TestCase[], code: string): Promise<RunResult> {
  const testCases: GraderWireTestCase[] = items.map((item) => ({
    id: item.tcId,
    input: item.input,
    expectedOutput: item.expected,
  }));

  try {
    const response = await retryOnce(() => callGraderOnce(code, testCases));
    return buildRunResult(response, items);
  } catch (cause) {
    throw systemError("graderClient.grade", cause);
  }
}
