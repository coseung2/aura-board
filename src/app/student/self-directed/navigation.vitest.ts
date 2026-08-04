import { describe, expect, it } from "vitest";

import {
  legacySelfDirectedHref,
  normalizeActivityView,
  normalizeSelfDirectedActivity,
} from "./navigation";

describe("self-directed navigation", () => {
  it("normalizes missing, invalid, and repeated activity queries", () => {
    expect(normalizeSelfDirectedActivity(undefined)).toBe("reading");
    expect(normalizeSelfDirectedActivity("unknown")).toBe("reading");
    expect(normalizeSelfDirectedActivity(["walking", "reading"])).toBe("walking");
  });

  it("accepts the shared record, mission, and title tabs", () => {
    expect(normalizeActivityView("reading", "missions")).toBe("missions");
    expect(normalizeActivityView("reading", "titles")).toBe("titles");
    expect(normalizeActivityView("walking", "titles")).toBe("titles");
    expect(normalizeActivityView("walking", "invalid")).toBe("records");
  });

  it("maps legacy routes to canonical URLs and preserves meaningful local tabs", () => {
    expect(legacySelfDirectedHref("reading", { tab: "titles" })).toBe(
      "/student/reading?tab=titles",
    );
    expect(legacySelfDirectedHref("walking", { view: "missions" })).toBe(
      "/student/walking?tab=missions",
    );
    expect(legacySelfDirectedHref("walking", { tab: "titles" })).toBe(
      "/student/walking?tab=titles",
    );
  });
});
