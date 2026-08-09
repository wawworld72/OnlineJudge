import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { isAfter, isBefore, isWithin } from "../../src/shared/timeAuthority";

describe("timeAuthority", () => {
  it("isBefore: startAt이 미래면 true, 과거면 false", () => {
    expect(isBefore(Timestamp.fromMillis(Date.now() + 60_000))).toBe(true);
    expect(isBefore(Timestamp.fromMillis(Date.now() - 60_000))).toBe(false);
  });

  it("isAfter: endAt이 과거면 true, 미래면 false", () => {
    expect(isAfter(Timestamp.fromMillis(Date.now() - 60_000))).toBe(true);
    expect(isAfter(Timestamp.fromMillis(Date.now() + 60_000))).toBe(false);
  });

  it("isWithin: 시작-종료 구간 안에서만 true", () => {
    const startAt = Timestamp.fromMillis(Date.now() - 60_000);
    const endAt = Timestamp.fromMillis(Date.now() + 60_000);
    expect(isWithin(startAt, endAt)).toBe(true);

    const notYetStarted = Timestamp.fromMillis(Date.now() + 60_000);
    expect(isWithin(notYetStarted, endAt)).toBe(false);

    const alreadyEnded = Timestamp.fromMillis(Date.now() - 60_000);
    expect(isWithin(startAt, alreadyEnded)).toBe(false);
  });
});
