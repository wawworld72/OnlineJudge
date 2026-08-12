import { describe, expect, it } from "vitest";
import { normalizeClassroomCourseId } from "../../src/shared/classroomCourseId";

describe("normalizeClassroomCourseId", () => {
  it("이미 숫자 ID면 그대로 반환한다", () => {
    expect(normalizeClassroomCourseId("844174755365")).toBe("844174755365");
  });

  it("classroom.google.com/c/<값> 형태의 base64 인코딩 값을 디코드한다", () => {
    expect(normalizeClassroomCourseId("ODQ0MTc0NzU1MzY1")).toBe("844174755365");
  });

  it("디코드해도 숫자가 아니면 원본 값을 그대로 반환한다", () => {
    expect(normalizeClassroomCourseId("not-a-real-id")).toBe("not-a-real-id");
  });
});
