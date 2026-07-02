import { describe, it, expect } from "vitest";
import {
  parseDateOrNull,
  formatDateOnly,
  todayDateString,
  DateString,
} from "../inspector-findings";

describe("parseDateOrNull", () => {
  it("returns UTC midnight for a valid YYYY-MM-DD", () => {
    const d = parseDateOrNull("2026-07-02");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });

  it("rejects empty / nullish input", () => {
    expect(parseDateOrNull(null)).toBeNull();
    expect(parseDateOrNull(undefined)).toBeNull();
    expect(parseDateOrNull("")).toBeNull();
  });

  it("rejects malformed strings", () => {
    expect(parseDateOrNull("2026/07/02")).toBeNull();
    expect(parseDateOrNull("26-07-02")).toBeNull();
    expect(parseDateOrNull("2026-7-2")).toBeNull();
  });

  it("rejects out-of-range month / day", () => {
    expect(parseDateOrNull("2026-13-01")).toBeNull();
    expect(parseDateOrNull("2026-00-10")).toBeNull();
    expect(parseDateOrNull("2026-05-00")).toBeNull();
    expect(parseDateOrNull("2026-05-32")).toBeNull();
  });
});

describe("formatDateOnly", () => {
  it("round-trips a UTC midnight Date", () => {
    const d = new Date(Date.UTC(2026, 6, 2));
    expect(formatDateOnly(d)).toBe("2026-07-02");
  });

  it("ignores local-time fields and uses UTC", () => {
    // 23:00 UTC on July 1 = 08:00 KST on July 2 in Asia/Seoul.
    // We still emit the UTC date (2026-07-01).
    const d = new Date(Date.UTC(2026, 6, 1, 23, 0, 0));
    expect(formatDateOnly(d)).toBe("2026-07-01");
  });
});

describe("todayDateString", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("DateString zod schema", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(DateString.safeParse("2026-07-02").success).toBe(true);
  });
  it("rejects other formats", () => {
    expect(DateString.safeParse("07/02/2026").success).toBe(false);
    expect(DateString.safeParse("").success).toBe(false);
    expect(DateString.safeParse("2026-7-2").success).toBe(false);
  });
});