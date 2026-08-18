import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { clearFirestore, makeAnonymousRequest, teardownTestApp } from "../testEnv";
import { teacherLogin } from "../../src/callable/teacherLogin";

describe("teacherLogin", () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("출입코드가 틀리면 거부한다", async () => {
    const user = await getAuth().createUser({});
    await expect(
      teacherLogin.run(makeAnonymousRequest({ accessCode: "wrong-code" }, user.uid)),
    ).rejects.toMatchObject({ code: "failed-precondition", details: { code: "INVALID_ACCESS_CODE" } });

    const unchanged = await getAuth().getUser(user.uid);
    expect(unchanged.customClaims ?? {}).toEqual({});
  });

  it("출입코드가 맞으면 그 계정에 teacher 커스텀 클레임을 부여한다", async () => {
    const user = await getAuth().createUser({});

    const response = await teacherLogin.run(
      makeAnonymousRequest({ accessCode: process.env.TEACHER_ACCESS_CODE! }, user.uid),
    );

    expect(response).toEqual({ ok: true });
    const updated = await getAuth().getUser(user.uid);
    expect(updated.customClaims).toEqual({ teacher: true });
  });
});
