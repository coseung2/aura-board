import { describe, expect, it } from "vitest";
import {
  buildContentSnapshot,
  buildHiddenLookup,
  canActOnContent,
  normalizeReportDetail,
  REPORT_DETAIL_MAX_LENGTH,
  REPORT_SNAPSHOT_MAX_LENGTH,
  resolveHiddenReason,
} from "../content-safety";

describe("normalizeReportDetail", () => {
  it("keeps trimmed text for the other reason", () => {
    expect(normalizeReportDetail("other", "  이상해요  ")).toBe("이상해요");
  });

  it("drops detail for fixed reasons so it cannot become a second text channel", () => {
    expect(normalizeReportDetail("profanity", "무시되어야 함")).toBeNull();
    expect(normalizeReportDetail("harassment", "무시되어야 함")).toBeNull();
    expect(normalizeReportDetail("personal_info", "무시되어야 함")).toBeNull();
  });

  it("returns null for empty or whitespace detail", () => {
    expect(normalizeReportDetail("other", "   ")).toBeNull();
    expect(normalizeReportDetail("other", undefined)).toBeNull();
  });

  it("caps detail length", () => {
    const detail = normalizeReportDetail("other", "가".repeat(400));
    expect(detail).toHaveLength(REPORT_DETAIL_MAX_LENGTH);
  });
});

describe("buildContentSnapshot", () => {
  it("caps the stored snapshot", () => {
    expect(buildContentSnapshot("나".repeat(900))).toHaveLength(REPORT_SNAPSHOT_MAX_LENGTH);
  });

  it("returns null when there is nothing to snapshot", () => {
    expect(buildContentSnapshot("  ")).toBeNull();
    expect(buildContentSnapshot(null)).toBeNull();
  });
});

describe("hidden lookup", () => {
  const lookup = buildHiddenLookup({
    hiddenTargets: [
      { targetKind: "comment", targetId: "c1" },
      { targetKind: "card", targetId: "k1" },
    ],
    hiddenAuthorStudentIds: ["s-blocked"],
  });

  it("separates target kinds sharing an id", () => {
    expect(lookup.isTargetHidden("comment", "c1")).toBe(true);
    expect(lookup.isTargetHidden("card", "c1")).toBe(false);
  });

  it("reports item hides ahead of author hides", () => {
    expect(resolveHiddenReason(lookup, "comment", "c1", "s-blocked")).toBe("item");
    expect(resolveHiddenReason(lookup, "comment", "c9", "s-blocked")).toBe("author");
    expect(resolveHiddenReason(lookup, "comment", "c9", "s-other")).toBeNull();
  });

  it("treats a missing author id as not hidden", () => {
    expect(lookup.isAuthorHidden(null)).toBe(false);
    expect(lookup.isAuthorHidden(undefined)).toBe(false);
  });

  it("exposes whether any hide exists so callers can skip work", () => {
    expect(lookup.hasAnyHide).toBe(true);
    expect(
      buildHiddenLookup({ hiddenTargets: [], hiddenAuthorStudentIds: [] }).hasAnyHide,
    ).toBe(false);
  });
});

describe("canActOnContent", () => {
  it("blocks acting on your own content", () => {
    expect(canActOnContent("s1", "s1")).toBe(false);
  });

  it("allows acting on a peer or an unattributed item", () => {
    expect(canActOnContent("s1", "s2")).toBe(true);
    expect(canActOnContent("s1", null)).toBe(true);
  });
});
