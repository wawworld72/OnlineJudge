import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

/**
 * firestore.rules 전체 접근 규칙 매트릭스 검증(contracts/firestore-access-summary.md 표
 * 전체). Admin SDK(Cloud Functions)로 시드하지 않고 규칙을 우회 없이 그대로 검증하기 위해
 * `testEnv.withSecurityRulesDisabled()`로 데이터를 심고, 인증된 클라이언트 컨텍스트로 규칙을
 * 검증한다.
 */
describe("firestore.rules 접근 규칙 매트릭스", () => {
  it("quizzes: status가 OPEN인 문서만 클라이언트 read를 허용하고, write는 항상 거부한다", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "quizzes/open-quiz"), { status: "OPEN" });
      await setDoc(doc(context.firestore(), "quizzes/draft-quiz"), { status: "DRAFT" });
    });

    const student = testEnv.authenticatedContext("student1").firestore();
    await assertSucceeds(getDoc(doc(student, "quizzes/open-quiz")));
    await assertFails(getDoc(doc(student, "quizzes/draft-quiz")));
    await assertFails(setDoc(doc(student, "quizzes/open-quiz"), { status: "OPEN" }));
  });

  it("problems: 상위 퀴즈가 OPEN이고 deletedAt이 null일 때만 read를 허용한다", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "quizzes/quiz-1"), { status: "OPEN" });
      await setDoc(doc(context.firestore(), "quizzes/quiz-1/problems/p1"), { deletedAt: null });
      await setDoc(doc(context.firestore(), "quizzes/quiz-1/problems/p2"), { deletedAt: "2026-01-01" });
    });

    const student = testEnv.authenticatedContext("student1").firestore();
    await assertSucceeds(getDoc(doc(student, "quizzes/quiz-1/problems/p1")));
    await assertFails(getDoc(doc(student, "quizzes/quiz-1/problems/p2")));
    await assertFails(setDoc(doc(student, "quizzes/quiz-1/problems/p1"), { deletedAt: null }));
  });

  it("problemSecrets: 예외 없이 read/write를 전면 차단한다", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "quizzes/quiz-1"), { status: "OPEN" });
      await setDoc(doc(context.firestore(), "quizzes/quiz-1/problemSecrets/p1"), { items: [] });
    });

    const student = testEnv.authenticatedContext("student1").firestore();
    await assertFails(getDoc(doc(student, "quizzes/quiz-1/problemSecrets/p1")));
    await assertFails(setDoc(doc(student, "quizzes/quiz-1/problemSecrets/p1"), { items: [] }));
  });

  it("participants: 본인 문서를 포함해 read/write를 전면 차단한다", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "participants/quiz-1_student1"), { studentId: "student1" });
    });

    const student = testEnv.authenticatedContext("student1").firestore();
    await assertFails(getDoc(doc(student, "participants/quiz-1_student1")));
    await assertFails(setDoc(doc(student, "participants/quiz-1_student1"), { studentId: "student1" }));
  });

  it.each(["students/s1", "rosters/r1", "accessLogs/l1"])(
    "%s: read/write를 전면 차단한다",
    async (path) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), path), { any: "value" });
      });

      const student = testEnv.authenticatedContext("student1").firestore();
      await assertFails(getDoc(doc(student, path)));
      await assertFails(setDoc(doc(student, path), { any: "value" }));
      await assertFails(deleteDoc(doc(student, path)));
    },
  );
});
