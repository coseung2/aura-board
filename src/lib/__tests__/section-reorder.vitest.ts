import { describe, expect, it } from "vitest";
import {
  applySectionReorder,
  buildSectionReorderPayload,
  reorderSectionForDrop,
} from "../section-reorder";

const sections = [
  { id: "pinned-a", pinned: true, order: 20 },
  { id: "pinned-b", pinned: true, order: 10 },
  { id: "topic-a", pinned: false, order: 30 },
  { id: "topic-b", pinned: false, order: 20 },
  { id: "topic-c", pinned: false, order: 10 },
];

describe("buildSectionReorderPayload", () => {
  it("persists the supplied visual order using the shared sort convention", () => {
    const payload = buildSectionReorderPayload(sections);

    expect(payload.map((row) => row.id)).toEqual([
      "pinned-a",
      "pinned-b",
      "topic-a",
      "topic-b",
      "topic-c",
    ]);
    expect(payload.slice(0, 2).map((row) => row.order)).toEqual([0, 1]);
    expect(payload.slice(2).every((row) => row.order < 0)).toBe(true);
    expect(payload[2]!.order).toBeGreaterThan(payload[3]!.order);
    expect(payload[3]!.order).toBeGreaterThan(payload[4]!.order);

    expect(applySectionReorder(sections, payload).map((row) => row.id)).toEqual(
      sections.map((row) => row.id),
    );
  });
});

describe("reorderSectionForDrop", () => {
  it("reorders within the same group without mutating the input", () => {
    const next = reorderSectionForDrop(sections, "topic-a", "topic-c");

    expect(next.map((row) => row.id)).toEqual([
      "pinned-a",
      "pinned-b",
      "topic-b",
      "topic-c",
      "topic-a",
    ]);
    expect(sections.map((row) => row.id)).toEqual([
      "pinned-a",
      "pinned-b",
      "topic-a",
      "topic-b",
      "topic-c",
    ]);
  });

  it("keeps pin state as the group boundary is crossed", () => {
    const next = reorderSectionForDrop(sections, "topic-c", "pinned-a");

    expect(next.map((row) => row.id)).toEqual([
      "pinned-a",
      "pinned-b",
      "topic-c",
      "topic-a",
      "topic-b",
    ]);
    expect(next.find((row) => row.id === "topic-c")?.pinned).toBe(false);
  });
});
