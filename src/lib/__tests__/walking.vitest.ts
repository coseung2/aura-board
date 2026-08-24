import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.queryRaw } }));

import {
  addWalkingDays,
  getClassroomWalkingSummary,
  getWalkingDayKey,
  getWalkingDayRange,
  isValidWalkingDay,
} from "../walking";

describe("walking day helpers", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
  });

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

  it("reads the last sync from all history while keeping activity sums bounded", async () => {
    mocks.queryRaw.mockResolvedValue([]);

    await getClassroomWalkingSummary("classroom-1");

    const query = mocks.queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(query.sql).toContain('SELECT MAX(all_w."syncedAt")');
    expect(query.sql).toContain('WHERE all_w."studentId" = s."id"');
    expect(query.sql).toContain('AND w."day" >=');
    expect(query.sql).toContain('AND w."day" <=');
  });
});
