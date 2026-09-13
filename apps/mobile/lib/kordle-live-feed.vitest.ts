import { describe, expect, it } from "vitest";
import { mergeKordleLiveEvents, type KordleLiveEvent } from "./kordle-live-feed";

function event(
  id: string,
  overrides: Partial<KordleLiveEvent> = {},
): KordleLiveEvent {
  return {
    id,
    name: "학생",
    guessIndex: 1,
    correctCount: 1,
    isCorrect: false,
    createdAt: `2026-09-13T00:00:${id.padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

describe("mergeKordleLiveEvents", () => {
  it("matches the web feed visibility and removes duplicate events", () => {
    expect(
      mergeKordleLiveEvents([event("01")], [
        event("01"),
        event("02", { correctCount: 0 }),
        event("03", { correctCount: 0, isCorrect: true }),
      ]).map((item) => item.id),
    ).toEqual(["01", "03"]);
  });

  it("keeps the newest 18 events in chronological display order", () => {
    const incoming = Array.from({ length: 20 }, (_, index) =>
      event(String(index + 1).padStart(2, "0")),
    ).reverse();
    const merged = mergeKordleLiveEvents([], incoming);
    expect(merged).toHaveLength(18);
    expect(merged[0]?.id).toBe("03");
    expect(merged.at(-1)?.id).toBe("20");
  });
});
