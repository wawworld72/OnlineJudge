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
import { processInChunks } from "../shared/chunkedConcurrency";
import { applyTestCaseDelta } from "../callable/testCases";
import { computePreDeployCheck } from "./preDeployCheck";
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
export function extractQuizIdFromUrl(url: string): string | null {
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
  /** mode==="updated"일 때만 있음 — 매칭 시점에 이미 읽어둔 기존 값. TC 변경이 없는
   *  요청은 이 값을 그대로 응답에 써서 문항을 다시 읽지 않아도 되게 한다. */
  existingPointsTotal?: number;
  existingTestCaseCount?: number;
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

/**
 * 퀴즈 안에서 title로 문항을 매칭하고, 각 문항 안에서 tcNo로 test case를 매칭한다
 * (읽기 전용). 3단계로 나눈다:
 *   1) 매칭·모드·order 확정 — 동기적으로, 요청 순서 그대로(자동 order 배정이 순서에
 *      의존하므로 이 단계는 순서를 지켜야 한다). Firestore 호출 없음.
 *   2) 매칭된 문항들의 problemSecrets를 `db.getAll()`로 한 번에 배치 조회(문항마다
 *      순차 `.get()`을 하지 않는다).
 *   3) test case 매칭 마무리 — 동기적.
 */
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

  interface PendingProblem {
    reqProblem: SheetProblemInput;
    mode: "created" | "updated";
    problemId?: string;
    order: number;
    existingPointsTotal?: number;
  }

  const pending: PendingProblem[] = requestProblems.map((reqProblem) => {
    const matches = existingProblems.filter((p) => p.title === reqProblem.title);
    if (matches.length > 1) {
      throw new SheetSyncError(
        `문항 제목 "${reqProblem.title}"이 여러 개 존재해 구분할 수 없습니다.`,
      );
    }

    if (matches.length === 1) {
      return {
        reqProblem,
        mode: "updated",
        problemId: matches[0]!.id,
        order: reqProblem.order ?? matches[0]!.order,
        existingPointsTotal: matches[0]!.pointsTotal,
      };
    }

    if (reqProblem.description === undefined || reqProblem.initialCode === undefined) {
      throw new SheetSyncError(
        `신규 문항 "${reqProblem.title}"을 추가하려면 description, initialCode를 포함해야 합니다.`,
      );
    }
    const order = reqProblem.order ?? autoOrder;
    if (reqProblem.order === undefined) autoOrder += 1;
    return { reqProblem, mode: "created", order };
  });

  const matchedRefs = pending
    .filter((p) => p.mode === "updated")
    .map((p) =>
      db.collection("quizzes").doc(quizId!).collection("problemSecrets").doc(p.problemId!),
    );
  const secretsSnaps = matchedRefs.length > 0 ? await db.getAll(...matchedRefs) : [];
  const itemsByProblemId = new Map<string, TestCase[]>();
  secretsSnaps.forEach((snap) => {
    itemsByProblemId.set(snap.id, (snap.data() as ProblemSecrets | undefined)?.items ?? []);
  });

  return pending.map((p) => {
    const existingItems = p.problemId ? (itemsByProblemId.get(p.problemId) ?? []) : [];
    return {
      reqProblem: p.reqProblem,
      mode: p.mode,
      problemId: p.problemId,
      order: p.order,
      existingPointsTotal: p.existingPointsTotal,
      existingTestCaseCount: existingItems.length,
      resolvedTestCases: resolveTestCases(existingItems, p.reqProblem.testCases ?? []),
    };
  });
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
  let pointsTotal: number;
  let testCaseCount: number;

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

    // TC 변경이 있으면 applyTestCaseDelta가 돌려주는 최신 값을 그대로 쓰고, 없으면
    // 매칭 단계(resolveProblems)에서 이미 읽어둔 기존 값을 그대로 쓴다 — 어느 쪽이든
    // 문항을 다시 읽지 않는다.
    if (resolvedTestCases.length > 0) {
      const result = await applyTestCaseDelta(quizId, problemId, (items) =>
        applyTestCaseOverlay(items, resolvedTestCases),
      );
      pointsTotal = result.pointsTotal;
      testCaseCount = result.items.length;
    } else {
      pointsTotal = resolvedProblem.existingPointsTotal!;
      testCaseCount = resolvedProblem.existingTestCaseCount!;
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
    pointsTotal = items.reduce((sum, item) => sum + item.points, 0);
    testCaseCount = items.length;

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

  return { problemId, title: reqProblem.title, pointsTotal, testCaseCount, mode };
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
 * 이 시도가 실패해도(아직 문항이 없음, 명부 미동기화, Classroom API 오류 등) 퀴즈
 * 생성/갱신 자체는 그대로 성공 처리한다. 이미 배포된 퀴즈는 건드리지 않는다(FR-029 —
 * 재배포는 resetClassroomDeployment 이후에만). 명부(rosters)는 courseId(Classroom
 * 강의) 단위로 저장되므로 여기서 매번 다시 동기화하지 않는다 — 같은 강의를 쓰는
 * 퀴즈가 여러 개라도 "Classroom 연동" 탭에서 강의당 한 번만 동기화하면 전부 그
 * 명부를 그대로 쓴다. 명부가 아예 없으면 아래 computePreDeployCheck의 BLOCK이
 * 배포를 막아준다(courseWorkLink는 null, classroomDeployPending: true).
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
      quiz.startAt.toDate(),
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
  let status: Quiz["status"];
  if (isUpdate) {
    quizId = targetQuizId!;
    mode = "updated";
    status = existingQuiz!.status; // 이 요청은 status를 절대 바꾸지 않으므로 기존 값 그대로.
    const patch = buildQuizPatch(input);
    if (Object.keys(patch).length > 0) {
      await db.collection("quizzes").doc(quizId).update(patch);
    }
  } else {
    mode = "created";
    status = "DRAFT";
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

  // 문항들은 서로 독립적인 문서(problems/{id}, problemSecrets/{id})만 건드리므로
  // pushGrades/batchGrade와 같은 방식(processInChunks, 동시성 10)으로 병렬 처리한다.
  const problemResults = await processInChunks(resolvedProblems, 10, (resolvedProblem) =>
    writeProblem(db, quizId, resolvedProblem),
  );

  const { courseWorkLink, classroomDeployPending } = await attemptClassroomDeploy(db, quizId);

  return {
    mode,
    quizId,
    quizUrl: `${getAppBaseUrl()}/quiz/${quizId}`,
    status,
    courseWorkLink,
    classroomDeployPending,
    problems: problemResults,
  };
}
