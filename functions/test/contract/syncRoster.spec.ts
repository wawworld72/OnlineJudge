import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { clearFirestore, makeTeacherRequest, teardownTestApp, testDb } from "../testEnv";

vi.mock("../../src/services/classroomClient", () => ({
  listCourseStudents: vi.fn(),
}));

const { listCourseStudents } = await import("../../src/services/classroomClient");
const { syncRoster } = await import("../../src/callable/syncRoster");

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

    const response = await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

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

    const response = await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    expect(response.newStudents).toBe(1);
    expect(response.updatedEmails).toBe(1);

    const updated = (await testDb().collection("students").doc("20240002").get()).data()!;
    expect(updated.email).toBe("20240002@hoseo.edu");
  });

  it("두 번째 동기화에서는 이미 존재하는 roster 항목을 갱신 집계로 처리한다", async () => {
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);
    await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    const response = await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    expect(response.newRosterEntries).toBe(0);
    expect(response.updatedRosterEntries).toBe(1);
  });

  it("Classroom에서 제외되어 더는 목록에 없는 학생의 명부 항목을 지운다", async () => {
    // enterQuiz가 courseId 있는 퀴즈는 이 명부만으로 신원을 확인하므로, 여기서 안 지우면
    // 교사가 Classroom에서 학생을 뺀 뒤 재동기화해도 그 학생이 예전 항목으로 계속 입장할
    // 수 있다 — 그게 이 테스트가 지키는 것.
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
      { userId: "u2", email: "20240002@hoseo.edu", name: "김철수" },
    ]);
    await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);
    const response = await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    expect(response.removedRosterEntries).toBe(1);
    const removed = await testDb().collection("rosters").doc(`${COURSE_ID}_20240002`).get();
    expect(removed.exists).toBe(false);
    const kept = await testDb().collection("rosters").doc(`${COURSE_ID}_20240001`).get();
    expect(kept.exists).toBe(true);
  });

  it("다른 강의(courseId)의 명부 항목은 건드리지 않는다", async () => {
    await testDb().collection("rosters").doc("other-course_20240099").set({
      courseId: "other-course",
      studentId: "20240099",
      name: "박영희",
      email: "20240099@hoseo.edu",
      syncedAt: new Date(),
    });
    vi.mocked(listCourseStudents).mockResolvedValue([
      { userId: "u1", email: "20240001@hoseo.edu", name: "홍길동" },
    ]);

    await syncRoster.run(makeTeacherRequest({ courseId: COURSE_ID }));

    const untouched = await testDb().collection("rosters").doc("other-course_20240099").get();
    expect(untouched.exists).toBe(true);
  });
});
