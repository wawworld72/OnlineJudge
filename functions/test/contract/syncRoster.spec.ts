import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { clearFirestore, makeRequest, teardownTestApp, testDb } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
}));

const { listCourseStudents } = await import("../../src/services/classroomClient");
const { syncRoster } = await import("../../src/callable/syncRoster");

const TEACHER_EMAIL = "teacher@hoseo.edu";
const COURSE_ID = "course-1";

describe("syncRoster", () => {
  beforeEach(async () => {
    await clearFirestore();
    vi.mocked(listCourseStudents).mockReset();
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  it("이메일 앞부분이 숫자가 아니어도 그대로 고유 식별자로 등록한다", async () => {
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
      { userId: "u2", email: "gihyun.hong@gmail.com", name: "홍기웅" },
    ]);

    const response = await syncRoster.run(makeRequest({ courseId: COURSE_ID }, TEACHER_EMAIL));

    expect(response.newStudents).toBe(2);
    expect(response.newRosterEntries).toBe(2);
    expect(response.skipped).toBe(0);

    const nonNumeric = (await testDb().collection("students").doc("gihyun.hong").get()).data();
    expect(nonNumeric?.name).toBe("홍기웅");
  });

  it("신규 학생은 students/rosters에 새로 만들고, 기존 학생은 이메일이 다를 때만 갱신 집계한다", async () => {
    await testDb().collection("students").doc("20240002").set({
      name: "김철수",
      email: "old-address@hoseo.edu",
      status: "ACTIVE",
    });
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
      { userId: "u2", email: "20240002@hoseo.edu", name: "김철수" },
    ]);

    const response = await syncRoster.run(makeRequest({ courseId: COURSE_ID }, TEACHER_EMAIL));

    expect(response.newStudents).toBe(1);
    expect(response.updatedEmails).toBe(1);

    const updated = (await testDb().collection("students").doc("20240002").get()).data()!;
    expect(updated.email).toBe("20240002@hoseo.edu");
  });

  it("두 번째 동기화에서는 이미 존재하는 roster 항목을 갱신 집계로 처리한다", async () => {
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);
    await syncRoster.run(makeRequest({ courseId: COURSE_ID }, TEACHER_EMAIL));

    const response = await syncRoster.run(makeRequest({ courseId: COURSE_ID }, TEACHER_EMAIL));

    expect(response.newRosterEntries).toBe(0);
    expect(response.updatedRosterEntries).toBe(1);
  });
});
