import { describe, expect, it } from "vitest";
import { mergeBoardSectionPositions } from "./board-section-events";

describe("board section position event merges", () => {
  it("keeps newer metadata while applying an older reorder snapshot", () => {
    const current = [
      {
        id: "one",
        title: "최신 이름",
        accessToken: "최신 토큰",
        order: -2,
        pinned: false,
      },
      {
        id: "two",
        title: "둘",
        accessToken: null,
        order: -1,
        pinned: false,
      },
    ];

    const merged = mergeBoardSectionPositions(current, [
      { id: "one", order: -1, pinned: false },
      { id: "two", order: -2, pinned: false },
    ]);

    expect(merged.map((section) => section.id)).toEqual(["one", "two"]);
    expect(merged[0]).toMatchObject({
      title: "최신 이름",
      accessToken: "최신 토큰",
      order: -1,
    });
  });

  it("supports BoardSection-like snapshots with optional positions", () => {
    const merged = mergeBoardSectionPositions(
      [
        {
          id: "one",
          title: "최신 이름",
          accessToken: null,
        },
      ],
      [{ id: "one", order: 0, pinned: true }],
    );

    expect(merged[0]).toMatchObject({
      id: "one",
      title: "최신 이름",
      order: 0,
      pinned: true,
    });
  });
});
