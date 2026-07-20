import { describe, expect, it } from "vitest";
import {
  formatDeadlineKst,
  localDateTimeToOffsetIso,
  toDateTimeLocalValue,
} from "./AssignmentDeadlineForm";

describe("assignment deadline UI date helpers", () => {
  it("converts datetime-local to an offset-aware instant", () => {
    const value = localDateTimeToOffsetIso("2099-07-20T21:30");
    expect(value).toMatch(/^2099-07-20T21:30:00[+-]\d{2}:\d{2}$/);
    expect(new Date(value ?? "").getTime()).not.toBeNaN();
    expect(localDateTimeToOffsetIso("2099-07-20T21:30:15")).toMatch(
      /^2099-07-20T21:30:15[+-]\d{2}:\d{2}$/,
    );
  });

  it("rejects malformed and normalized-away local dates", () => {
    expect(localDateTimeToOffsetIso("2099-7-20T21:30")).toBeNull();
    expect(localDateTimeToOffsetIso("2099-02-30T21:30")).toBeNull();
  });

  it("round-trips existing absolute deadlines for editing", () => {
    const value = toDateTimeLocalValue("2099-07-20T12:30:00.000Z");
    expect(value).toMatch(/^2099-07-20T\d{2}:\d{2}$/);
    expect(formatDeadlineKst("2099-07-20T12:30:00.000Z")).toContain("2099");
  });
});
