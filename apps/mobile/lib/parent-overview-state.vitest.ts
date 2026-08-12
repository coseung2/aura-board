import { describe, expect, it } from "vitest";
import { removeParentLinkFromOverview } from "./parent-overview-state";
import type { ParentChildrenResponse } from "./types";

const overview: ParentChildrenResponse = {
  parent: { id: "parent-1", name: "보호자", email: "parent@example.com" },
  children: [
    {
      id: "active-link",
      studentId: "student-1",
      name: "민준",
      number: 3,
      classroom: { id: "class-1", name: "햇살반" },
      linkedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  pendingLinks: [
    {
      id: "pending-link",
      studentId: "student-2",
      name: "서연",
      number: 4,
      classroom: { id: "class-2", name: "별빛반" },
      requestedAt: "2026-08-11T00:00:00.000Z",
      expiresAt: "2026-08-18T00:00:00.000Z",
    },
  ],
};

describe("removeParentLinkFromOverview", () => {
  it("removes active and pending links without mutating the rollback snapshot", () => {
    const withoutActive = removeParentLinkFromOverview(overview, "active-link");
    const withoutPending = removeParentLinkFromOverview(overview, "pending-link");

    expect(withoutActive.children).toEqual([]);
    expect(withoutActive.pendingLinks).toHaveLength(1);
    expect(withoutPending.children).toHaveLength(1);
    expect(withoutPending.pendingLinks).toEqual([]);
    expect(overview.children).toHaveLength(1);
    expect(overview.pendingLinks).toHaveLength(1);
  });
});
