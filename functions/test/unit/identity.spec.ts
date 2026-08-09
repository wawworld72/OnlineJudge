import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { clearFirestore, teardownTestApp, testDb } from "../testEnv";
import { resolveStudentIdByEmail, verifyStudentIdentity } from "../../src/shared/identity";

describe("identity", () => {
  beforeEach(async () => {
    await clearFirestore();
    await testDb().collection("students").doc("20240001").set({
      name: "홍길동",
      email: "hong@hoseo.edu",
      status: "ACTIVE",
    });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  describe("verifyStudentIdentity", () => {
    it("학번·이름·이메일이 모두 일치하면 통과한다", async () => {
      const result = await verifyStudentIdentity(testDb(), {
        studentId: "20240001",
        name: "홍길동",
        authEmail: "hong@hoseo.edu",
      });
      expect(result.studentId).toBe("20240001");
    });

    it("존재하지 않는 학번은 IDENTITY_MISMATCH", async () => {
      await expect(
        verifyStudentIdentity(testDb(), { studentId: "nope", name: "홍길동", authEmail: "hong@hoseo.edu" }),
      ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
    });

    it("이름이 다르면 IDENTITY_MISMATCH", async () => {
      await expect(
        verifyStudentIdentity(testDb(), {
          studentId: "20240001",
          name: "다른이름",
          authEmail: "hong@hoseo.edu",
        }),
      ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
    });

    it("INACTIVE 상태의 학생은 이름이 맞아도 IDENTITY_MISMATCH", async () => {
      await testDb().collection("students").doc("20240001").update({ status: "INACTIVE" });
      await expect(
        verifyStudentIdentity(testDb(), {
          studentId: "20240001",
          name: "홍길동",
          authEmail: "hong@hoseo.edu",
        }),
      ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
    });

    it("이메일이 null이면 NEEDS_EMAIL_REGISTRATION", async () => {
      await testDb().collection("students").doc("20240001").update({ email: null });
      await expect(
        verifyStudentIdentity(testDb(), {
          studentId: "20240001",
          name: "홍길동",
          authEmail: "hong@hoseo.edu",
        }),
      ).rejects.toMatchObject({ details: { code: "NEEDS_EMAIL_REGISTRATION" } });
    });

    it("로그인 이메일이 등록된 이메일과 다르면 IDENTITY_MISMATCH", async () => {
      await expect(
        verifyStudentIdentity(testDb(), {
          studentId: "20240001",
          name: "홍길동",
          authEmail: "someone-else@hoseo.edu",
        }),
      ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
    });
  });

  describe("resolveStudentIdByEmail", () => {
    it("이메일로 학번을 역으로 찾는다", async () => {
      const studentId = await resolveStudentIdByEmail(testDb(), "hong@hoseo.edu");
      expect(studentId).toBe("20240001");
    });

    it("일치하는 학생이 없으면 IDENTITY_MISMATCH", async () => {
      await expect(resolveStudentIdByEmail(testDb(), "nobody@hoseo.edu")).rejects.toMatchObject({
        details: { code: "IDENTITY_MISMATCH" },
      });
    });
  });
});
