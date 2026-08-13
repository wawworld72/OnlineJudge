import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";
import { registerStudentEmail } from "../../src/callable/registerStudentEmail";

const STUDENT_ID = "20240001";
const OTHER_STUDENT_ID = "20240002";

describe("registerStudentEmail", () => {
  beforeEach(async () => {
    await clearFirestore();
    const db = testDb();
    await db.collection("students").doc(STUDENT_ID).set({
      name: "홍길동",
      email: null,
      status: "ACTIVE",
    });
    await db.collection("students").doc(OTHER_STUDENT_ID).set({
      name: "김철수",
      email: "kim@hoseo.edu",
      status: "ACTIVE",
    });
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("이메일이 등록되지 않은 학번에 로그인 이메일을 영구히 연결한다", async () => {
    const response = await registerStudentEmail.run(
      makeRequest({ studentId: STUDENT_ID, name: "홍길동" }, "hong@hoseo.edu"),
    );

    expect(response.ok).toBe(true);
    const student = (await testDb().collection("students").doc(STUDENT_ID).get()).data()!;
    expect(student.email).toBe("hong@hoseo.edu");
  });

  it("이미 이메일이 등록된 학번의 재등록 요청을 거부한다", async () => {
    await registerStudentEmail.run(
      makeRequest({ studentId: STUDENT_ID, name: "홍길동" }, "hong@hoseo.edu"),
    );

    await expect(
      registerStudentEmail.run(
        makeRequest({ studentId: STUDENT_ID, name: "홍길동" }, "hong-new@hoseo.edu"),
      ),
    ).rejects.toMatchObject({ details: { code: "EMAIL_ALREADY_REGISTERED" } });
  });

  it("다른 학번에 이미 등록된 이메일의 재사용 요청을 거부한다", async () => {
    await expect(
      registerStudentEmail.run(
        makeRequest({ studentId: STUDENT_ID, name: "홍길동" }, "kim@hoseo.edu"),
      ),
    ).rejects.toMatchObject({ details: { code: "EMAIL_ALREADY_IN_USE" } });
  });

  it("학번은 맞지만 이름이 다르면 IDENTITY_MISMATCH로 거부한다", async () => {
    await expect(
      registerStudentEmail.run(
        makeRequest({ studentId: STUDENT_ID, name: "다른이름" }, "hong@hoseo.edu"),
      ),
    ).rejects.toMatchObject({ details: { code: "IDENTITY_MISMATCH" } });
  });

  it("영문 계정명 학번·이름은 대소문자·공백이 달라도 등록에 성공한다", async () => {
    const db = testDb();
    await db.collection("students").doc("gihyun.hong").set({
      name: "Gihyun Hong",
      email: null,
      status: "ACTIVE",
    });

    const response = await registerStudentEmail.run(
      makeRequest(
        { studentId: "Gihyun.Hong", name: "  gihyun hong  " },
        "gihyun.hong@gmail.com",
      ),
    );

    expect(response.ok).toBe(true);
    const student = (await db.collection("students").doc("gihyun.hong").get()).data()!;
    expect(student.email).toBe("gihyun.hong@gmail.com");
  });
});
