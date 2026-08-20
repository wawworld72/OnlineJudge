import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { z } from "zod";
import type {
  sheetProblemSchema,
  sheetTestCaseSchema,
  sheetUpsertQuizSchema,
} from "../shared/schemas";
import { normalizeClassroomCourseId } from "../shared/classroomCourseId";
import { parseFlexibleTimestamp } from "../shared/flexibleTimestamp";
import { isAfter } from "../shared/timeAuthority";
import { applyTestCaseDelta } from "../callable/testCases";
import { computePreDeployCheck } from "./preDeployCheck";
import { syncCourseRoster } from "./rosterSync";
import { createCourseWork } from "./classroomClient";
import { getAppBaseUrl, getClassroomTeacherEmail } from "../config";
import type { Problem, ProblemSecrets, Quiz, TestCase } from "../models/types";

/**
 * `upsertQuizFromSheet`(Google Apps Script, onRequest)가 던지는 도메인 오류. Callable
 * 전용인 `domainError`/`HttpsError`와 달리, 이 message를 그대로 HTTP 200 `{ok:false,
 * error}` 응답에 실어 보낸다(exportGradesToSheet와 같은 관례).
 */
export class SheetSyncError extends Error {}

type SheetInput = z.infer<typeof sheetUpsertQuizSchema>;
type SheetProblemInput = z.infer<typeof sheetProblemSchema>;
type SheetTestCaseInput = z.infer<typeof sheetTestCaseSchema>;

export interface SheetSyncProblemResult {
  problemId: string;
  title: string;
  pointsTotal: number;
  testCaseCount: number;
  mode: "created" | "updated";
}

export interface SheetSyncResult {
  mode: "created" | "updated";
  quizId: string;
  quizUrl: string;
  status: Quiz["status"];
  courseWorkLink: string | null;
  classroomDeployPending: boolean;
  problems: SheetSyncProblemResult[];
}

/** `${getAppBaseUrl()}/quiz/{quizId}` 형태의 URL에서 마지막 경로 조각(quizId)만 뽑는다. */
function extractQuizIdFromUrl(url: string): string | null {
  const withoutQuery = url.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

interface ResolvedTestCase {
  reqTc: SheetTestCaseInput;
  mode: "created" | "updated";
  tcId?: string;
}

interface ResolvedProblem {
  reqProblem: SheetProblemInput;
  mode: "created" | "updated";
  problemId?: string;
  order: number;
  resolvedTestCases: ResolvedTestCase[];
}

/** 문항 하나(신규 또는 매칭된 기존 문항) 안에서 tcNo로 test case를 매칭한다(읽기 전용). */
function resolveTestCases(
  existingItems: TestCase[],
  requestTestCases: SheetTestCaseInput[],
): ResolvedTestCase[] {
  return requestTestCases.map((reqTc) => {
    const matches = existingItems.filter((item) => item.tcNo === reqTc.tcNo);
    if (matches.length > 1) {
      throw new SheetSyncError(`TC 번호 ${reqTc.tcNo}가 여러 개 존재해 구분할 수 없습니다.`);
    }
    if (matches.length === 1) {
      return { reqTc, mode: "updated", tcId: matches[0]!.tcId };
    }
    if (
      reqTc.input === undefined ||
      reqTc.expected === undefined ||
      reqTc.points === undefined ||
      reqTc.isPublic === undefined
    ) {
      throw new SheetSyncError(
        `TC ${reqTc.tcNo}가 새로 추가되려면 input, expected, points, isPublic을 모두 포함해야 합니다.`,
      );
    }
    return { reqTc, mode: "created" };
  });
}

/** 퀴즈 안에서 title로 문항을 매칭하고, 각 문항 안에서 tcNo로 test case를 매칭한다(읽기 전용). */
async function resolveProblems(
  db: Firestore,
  quizId: string | null,
  requestProblems: SheetProblemInput[],
): Promise<ResolvedProblem[]> {
  const existingProblems: Array<{ id: string } & Problem> = quizId
    ? (
        await db
          .collection("quizzes")
          .doc(quizId)
          .collection("problems")
          .where("deletedAt", "==", null)
          .get()
      ).docs.map((doc) => ({ id: doc.id, ...(doc.data() as Problem) }))
    : [];

  let autoOrder =
    existingProblems.length > 0 ? Math.max(...existingProblems.map((p) => p.order)) + 1 : 0;

  const resolved: ResolvedProblem[] = [];
  for (const reqProblem of requestProblems) {
    const matches = existingProblems.filter((p) => p.title === reqProblem.title);
    if (matches.length > 1) {
      throw new SheetSyncError(
        `문항 제목 "${reqProblem.title}"이 여러 개 존재해 구분할 수 없습니다.`,
      );
    }

    let mode: "created" | "updated";
    let problemId: string | undefined;
    let existingItems: TestCase[] = [];

    if (matches.length === 1) {
      mode = "updated";
      problemId = matches[0]!.id;
      const secretsSnap = await db
        .collection("quizzes")
        .doc(quizId!)
        .collection("problemSecrets")
        .doc(problemId)
        .get();
      existingItems = (secretsSnap.data() as ProblemSecrets | undefined)?.items ?? [];
    } else {
      mode = "created";
      if (reqProblem.description === undefined || reqProblem.initialCode === undefined) {
        throw new SheetSyncError(
          `신규 문항 "${reqProblem.title}"을 추가하려면 description, initialCode를 포함해야 합니다.`,
        );
      }
    }

    const order = reqProblem.order ?? autoOrder;
    if (mode === "created" && reqProblem.order === undefined) autoOrder += 1;

    resolved.push({
      reqProblem,
      mode,
      problemId,
      order,
      resolvedTestCases: resolveTestCases(existingItems, reqProblem.testCases ?? []),
    });
  }
  return resolved;
}

function buildQuizPatch(input: SheetInput): Partial<Record<keyof Quiz, unknown>> {
  const patch: Partial<Record<keyof Quiz, unknown>> = {};
  if (input.subjectName !== undefined) patch.subjectName = input.subjectName;
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.startAt !== undefined) patch.startAt = parseFlexibleTimestamp(input.startAt);
  if (input.endAt !== undefined) patch.endAt = parseFlexibleTimestamp(input.endAt);
  if (input.accessCode !== undefined) patch.accessCode = input.accessCode;
  if (input.maxRunsPerProblem !== undefined) patch.maxRunsPerProblem = input.maxRunsPerProblem;
  if (input.courseId !== undefined) {
    patch.courseId = input.courseId ? normalizeClassroomCourseId(input.courseId) : null;
  }
  return patch;
}

async function writeProblem(
  db: Firestore,
  quizId: string,
  resolvedProblem: ResolvedProblem,
): Promise<SheetSyncProblemResult> {
  const { reqProblem, mode, resolvedTestCases } = resolvedProblem;
  const problemsRef = db.collection("quizzes").doc(quizId).collection("problems");

  let problemId: string;
  if (mode === "updated") {
    problemId = resolvedProblem.problemId!;
    const metadata: Partial<Problem> = {};
    if (reqProblem.description !== undefined) metadata.description = reqProblem.description;
    if (reqProblem.initialCode !== undefined) metadata.initialCode = reqProblem.initialCode;
    if (reqProblem.maxRuns !== undefined) metadata.maxRuns = reqProblem.maxRuns;
    if (reqProblem.order !== undefined) metadata.order = reqProblem.order;
    if (Object.keys(metadata).length > 0) {
      await problemsRef.doc(problemId).update(metadata);
    }

    if (resolvedTestCases.length > 0) {
      await applyTestCaseDelta(quizId, problemId, (items) =>
        applyTestCaseOverlay(items, resolvedTestCases),
      );
    }
  } else {
    const problemRef = problemsRef.doc();
    problemId = problemRef.id;
    const items: TestCase[] = resolvedTestCases.map((rt) => ({
      tcId: randomUUID(),
      tcNo: rt.reqTc.tcNo,
      input: rt.reqTc.input ?? "",
      expected: rt.reqTc.expected ?? "",
      points: rt.reqTc.points ?? 0,
      isPublic: rt.reqTc.isPublic ?? false,
      description: rt.reqTc.description ?? "",
    }));
    const pointsTotal = items.reduce((sum, item) => sum + item.points, 0);

    const batch = db.batch();
    batch.set(problemRef, {
      order: resolvedProblem.order,
      title: reqProblem.title,
      description: reqProblem.description ?? "",
      initialCode: reqProblem.initialCode ?? "",
      maxRuns: reqProblem.maxRuns ?? null,
      pointsTotal,
      updatedAt: FieldValue.serverTimestamp(),
      deletedAt: null,
    });
    batch.set(db.collection("quizzes").doc(quizId).collection("problemSecrets").doc(problemId), {
      items,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  const problemSnap = await problemsRef.doc(problemId).get();
  const problem = problemSnap.data() as Problem;
  const secretsSnap = await db
    .collection("quizzes")
    .doc(quizId)
    .collection("problemSecrets")
    .doc(problemId)
    .get();
  const testCaseCount = ((secretsSnap.data() as ProblemSecrets | undefined)?.items ?? []).length;

  return { problemId, title: problem.title, pointsTotal: problem.pointsTotal, testCaseCount, mode };
}

/** 기존 items에 이번 요청의 모든 TC 변경(매칭된 것은 부분 갱신, 새 것은 추가)을 한 번에 접는다. */
function applyTestCaseOverlay(
  items: TestCase[],
  resolvedTestCases: ResolvedTestCase[],
): TestCase[] {
  let next = items;
  for (const { reqTc, mode, tcId } of resolvedTestCases) {
    if (mode === "updated") {
      next = next.map((item) =>
        item.tcId === tcId
          ? {
              ...item,
              input: reqTc.input ?? item.input,
              expected: reqTc.expected ?? item.expected,
              points: reqTc.points ?? item.points,
              isPublic: reqTc.isPublic ?? item.isPublic,
              description: reqTc.description ?? item.description,
            }
          : item,
      );
    } else {
      next = [
        ...next,
        {
          tcId: randomUUID(),
          tcNo: reqTc.tcNo,
          input: reqTc.input!,
          expected: reqTc.expected!,
          points: reqTc.points!,
          isPublic: reqTc.isPublic!,
          description: reqTc.description ?? "",
        },
      ];
    }
  }
  return next;
}

/**
 * `courseId`가 있고 아직 배포되지 않은 퀴즈를 최선노력으로 Classroom에 배포한다 —
 * `setQuizStatus`의 OPEN 자동동기화와 같은 원칙: 이 시도가 실패해도(명부 미동기화,
 * 아직 문항이 없음, Classroom API 오류 등) 퀴즈 생성/갱신 자체는 그대로 성공 처리한다.
 * 이미 배포된 퀴즈는 건드리지 않는다(FR-029 — 재배포는 resetClassroomDeployment 이후에만).
 */
async function attemptClassroomDeploy(
  db: Firestore,
  quizId: string,
): Promise<{ courseWorkLink: string | null; classroomDeployPending: boolean }> {
  const quiz = (await db.collection("quizzes").doc(quizId).get()).data() as Quiz;

  if (!quiz.courseId) {
    return { courseWorkLink: null, classroomDeployPending: false };
  }
  if (quiz.courseWorkId) {
    return { courseWorkLink: quiz.courseWorkLink, classroomDeployPending: false };
  }

  try {
    await syncCourseRoster(db, quiz.courseId);
  } catch (cause) {
    logger.warn("quizSheetSync: Classroom 자동배포 전 명부 동기화 실패", { quizId, cause });
  }

  if (isAfter(quiz.endAt)) {
    return { courseWorkLink: null, classroomDeployPending: true };
  }
  const { blockingCount } = await computePreDeployCheck(db, quizId);
  if (blockingCount > 0) {
    return { courseWorkLink: null, classroomDeployPending: true };
  }

  const problemsSnap = await db
    .collection("quizzes")
    .doc(quizId)
    .collection("problems")
    .where("deletedAt", "==", null)
    .get();
  const maxPoints = problemsSnap.docs.reduce(
    (sum, doc) => sum + (doc.data() as Problem).pointsTotal,
    0,
  );
  const joinUrl = `${getAppBaseUrl()}/quiz/${quizId}`;

  try {
    const result = await createCourseWork(
      quiz.courseId,
      quiz.title,
      quiz.description,
      maxPoints,
      quiz.endAt.toDate(),
      joinUrl,
      getClassroomTeacherEmail(),
    );
    await db
      .collection("quizzes")
      .doc(quizId)
      .update({ courseWorkId: result.courseWorkId, courseWorkLink: result.alternateLink });
    return { courseWorkLink: result.alternateLink, classroomDeployPending: false };
  } catch (cause) {
    logger.warn("quizSheetSync: Classroom 자동배포 실패", { quizId, cause });
    return { courseWorkLink: null, classroomDeployPending: true };
  }
}

export async function syncQuizFromSheet(
  db: Firestore,
  input: SheetInput,
): Promise<SheetSyncResult> {
  const targetQuizId = input.quizId ?? (input.quizUrl ? extractQuizIdFromUrl(input.quizUrl) : null);
  const isUpdate = Boolean(input.quizId || input.quizUrl);

  let existingQuiz: Quiz | undefined;
  if (isUpdate) {
    if (!targetQuizId) {
      throw new SheetSyncError("quizUrl 형식이 올바르지 않습니다.");
    }
    const snap = await db.collection("quizzes").doc(targetQuizId).get();
    existingQuiz = snap.data() as Quiz | undefined;
    if (!snap.exists || !existingQuiz || existingQuiz.deletedAt !== null) {
      throw new SheetSyncError("quizId(또는 quizUrl)에 해당하는 퀴즈를 찾을 수 없습니다.");
    }
  }

  // Phase 1: 문항/TC 매칭을 전부 읽기 전용으로 검증한다 — 하나라도 문제가 있으면
  // 아무것도 쓰지 않고 전체 요청을 거부한다(부분 적용 방지).
  const resolvedProblems = await resolveProblems(
    db,
    isUpdate ? targetQuizId! : null,
    input.problems ?? [],
  );

  // Phase 2: 쓰기.
  let quizId: string;
  let mode: "created" | "updated";
  if (isUpdate) {
    quizId = targetQuizId!;
    mode = "updated";
    const patch = buildQuizPatch(input);
    if (Object.keys(patch).length > 0) {
      await db.collection("quizzes").doc(quizId).update(patch);
    }
  } else {
    mode = "created";
    const newQuiz: Quiz = {
      subjectName: input.subjectName!,
      title: input.title!,
      description: input.description!,
      startAt: parseFlexibleTimestamp(input.startAt!),
      endAt: parseFlexibleTimestamp(input.endAt!),
      accessCode: input.accessCode!,
      status: "DRAFT",
      maxRunsPerProblem: input.maxRunsPerProblem!,
      courseId: input.courseId ? normalizeClassroomCourseId(input.courseId) : null,
      courseWorkId: null,
      courseWorkLink: null,
      archivedAt: null,
      archiveSpreadsheetUrl: null,
      deletedAt: null,
    };
    const quizRef = await db.collection("quizzes").add(newQuiz);
    quizId = quizRef.id;
  }

  const problemResults: SheetSyncProblemResult[] = [];
  for (const resolvedProblem of resolvedProblems) {
    problemResults.push(await writeProblem(db, quizId, resolvedProblem));
  }

  const { courseWorkLink, classroomDeployPending } = await attemptClassroomDeploy(db, quizId);

  const finalQuiz = (await db.collection("quizzes").doc(quizId).get()).data() as Quiz;

  return {
    mode,
    quizId,
    quizUrl: `${getAppBaseUrl()}/quiz/${quizId}`,
    status: finalQuiz.status,
    courseWorkLink,
    classroomDeployPending,
    problems: problemResults,
  };
}
