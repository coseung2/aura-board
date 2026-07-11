import { describe, expect, it } from "vitest";
import {
  mergeSectionPositions,
  moveSectionToTarget,
  normalizeSectionOrders,
  setSectionPinned,
  toSectionReorderPayload,
} from "./section-order";
import { sortSections } from "./sort-sections";

type Section = {
  id: string;
  order: number;
  pinned: boolean;
  title: string;
};

function ids(sections: readonly Section[]) {
  return sections.map((section) => section.id);
}

describe("topic-board section ordering", () => {
  const sections: Section[] = [
    { id: "pinned", title: "고정", pinned: true, order: 4 },
    { id: "first", title: "첫째", pinned: false, order: 30 },
    { id: "second", title: "둘째", pinned: false, order: 20 },
    { id: "third", title: "셋째", pinned: false, order: 10 },
  ];

  it("normalizes visual order and leaves room for a newly-created section", () => {
    const normalized = normalizeSectionOrders(sections);

    expect(ids(normalized)).toEqual(["pinned", "first", "second", "third"]);
    expect(normalized[0]?.order).toBe(0);
    expect(normalized.slice(1).every((section) => section.order < 0)).toBe(true);
    expect(normalized[1]!.order).toBeGreaterThan(normalized[2]!.order);

    const withNewSection = [
      ...normalized,
      { id: "new", title: "새 주제", pinned: false, order: 0 },
    ].sort(sortSections);
    expect(ids(withNewSection)).toEqual([
      "pinned",
      "new",
      "first",
      "second",
      "third",
    ]);
  });

  it("moves a section using the board drop semantics", () => {
    const moved = moveSectionToTarget(sections, "third", "first");

    expect(moved).not.toBeNull();
    expect(ids(moved!)).toEqual(["pinned", "third", "first", "second"]);
  });

  it("keeps pin groups stable while pinning and unpinning", () => {
    const pinned = setSectionPinned(sections, "second", true);
    expect(ids(pinned!)).toEqual(["pinned", "second", "first", "third"]);

    const unpinned = setSectionPinned(pinned!, "pinned", false);
    expect(ids(unpinned!)).toEqual(["second", "pinned", "first", "third"]);
  });

  it("builds the API payload in validated visual order", () => {
    const payload = toSectionReorderPayload([
      sections[3]!,
      sections[1]!,
      sections[0]!,
      sections[2]!,
    ]);

    expect(payload.map(({ id, pinned }) => ({ id, pinned }))).toEqual([
      { id: "pinned", pinned: true },
      { id: "first", pinned: false },
      { id: "second", pinned: false },
      { id: "third", pinned: false },
    ]);
  });

  it("merges confirmed positions without dropping live metadata", () => {
    const current = sections.map((section) => ({
      ...section,
      title: `${section.title} (실시간 변경)`,
    }));
    const positions = toSectionReorderPayload(
      moveSectionToTarget(sections, "third", "first")!,
    );

    const merged = mergeSectionPositions(current, positions);

    expect(ids(merged)).toEqual(["pinned", "third", "first", "second"]);
    expect(merged.find((section) => section.id === "third")?.title).toBe(
      "셋째 (실시간 변경)",
    );
  });
});
