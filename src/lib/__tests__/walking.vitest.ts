import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  addWalkingDays,
  getWalkingDayKey,
  getWalkingDayRange,
  isValidWalkingDay,
} from "../walking";

describe("walking day helpers", () => {
  it("uses the Asia/Seoul calendar day at UTC midnight boundaries", () => {
    expect(getWalkingDayKey(new Date("2026-07-11T14:59:59.999Z"))).toBe("2026-07-11");
    expect(getWalkingDayKey(new Date("2026-07-11T15:00:00.000Z"))).toBe("2026-07-12");
  });

  it.each([
    ["2026-02-28", true],
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-04-31", false],
    ["2026-13-01", false],
    ["2026-7-1", false],
    ["2026-02-31", false],
  ])("validates %s as %s", (value, expected) => {
    expect(isValidWalkingDay(value)).toBe(expected);
  });

  it("builds a bounded KST range and shifts days in UTC", () => {
    const now = new Date("2026-07-11T15:00:00.000Z");
    expect(getWalkingDayRange(now, 7)).toEqual({
      minDay: "2026-07-06",
      maxDay: "2026-07-12",
    });
    expect(addWalkingDays("2024-03-01", -1)).toBe("2024-02-29");
  });
});
