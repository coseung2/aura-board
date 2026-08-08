import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  db: { $queryRaw: mocks.queryRaw },
}));

import { loadHiddenLookup } from "./content-safety-service";

describe("loadHiddenLookup", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
  });

  it("loads target and author hides in one database round trip", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        targets: [
          { targetKind: "card", targetId: "card-1" },
          { targetKind: "comment", targetId: "comment-1" },
          { targetKind: "unknown", targetId: "ignored" },
        ],
        hidden_author_ids: ["student-2", 123],
      },
    ]);

    const lookup = await loadHiddenLookup("student-1");

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(lookup.hasAnyHide).toBe(true);
    expect(lookup.isTargetHidden("card", "card-1")).toBe(true);
    expect(lookup.isTargetHidden("comment", "comment-1")).toBe(true);
    expect(lookup.isTargetHidden("card", "ignored")).toBe(false);
    expect(lookup.isAuthorHidden("student-2")).toBe(true);
  });

  it("returns an empty lookup for malformed or absent aggregates", async () => {
    mocks.queryRaw.mockResolvedValue([{}]);

    const lookup = await loadHiddenLookup("student-1");

    expect(lookup.hasAnyHide).toBe(false);
    expect(lookup.isTargetHidden("card", "card-1")).toBe(false);
    expect(lookup.isAuthorHidden("student-2")).toBe(false);
  });
});
