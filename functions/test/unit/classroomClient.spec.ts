import "../testEnv";
import { describe, expect, it, vi, beforeEach } from "vitest";

const courseWorkCreateMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: vi.fn() },
    classroom: vi.fn(() => ({
      courses: { courseWork: { create: courseWorkCreateMock } },
    })),
  },
}));

const { createCourseWork } = await import("../../src/services/classroomClient");

describe("classroomClient.createCourseWork", () => {
  beforeEach(() => {
    courseWorkCreateMock.mockReset();
    courseWorkCreateMock.mockResolvedValue({
      data: { id: "cw-1", alternateLink: "https://classroom.example/cw-1" },
    });
  });

  it("시작 시각이 미래면 DRAFT + scheduledTime으로 예약 게시한다", async () => {
    const startAt = new Date(Date.now() + 60_000);
    const dueAt = new Date(Date.now() + 120_000);

    await createCourseWork(
      "course-1",
      "제목",
      "설명",
      100,
      startAt,
      dueAt,
      "https://example.com/quiz/1",
      "teacher@hoseo.edu",
    );

    const body = courseWorkCreateMock.mock.calls[0]![0].requestBody;
    expect(body.state).toBe("DRAFT");
    expect(body.scheduledTime).toBe(startAt.toISOString());
  });

  it("시작 시각이 이미 지났으면 즉시 PUBLISHED로 게시한다", async () => {
    const startAt = new Date(Date.now() - 60_000);
    const dueAt = new Date(Date.now() + 120_000);

    await createCourseWork(
      "course-1",
      "제목",
      "설명",
      100,
      startAt,
      dueAt,
      "https://example.com/quiz/1",
      "teacher@hoseo.edu",
    );

    const body = courseWorkCreateMock.mock.calls[0]![0].requestBody;
    expect(body.state).toBe("PUBLISHED");
    expect(body.scheduledTime).toBeUndefined();
  });
});
