import { describe, expect, it } from "vitest";
import type { CardData } from "../DraggableCard";
import {
  buildTimeline,
  buildWordCloud,
  limitWordCloudInput,
} from "./StreamActivityPanels";

function card(id: string, title: string, content: string): CardData {
  return { id, title, content } as CardData;
}

describe("stream activity models", () => {
  it("limits word-cloud responses to two normalized words", () => {
    expect(limitWordCloudInput("  첫째   둘째   셋째 ")).toBe("첫째 둘째");
    expect(limitWordCloudInput("첫째 ")).toBe("첫째 ");
  });

  it("aggregates equivalent word-cloud responses case-insensitively", () => {
    const words = buildWordCloud([
      card("a", "", "Aura"),
      card("b", "", "aura"),
      card("c", "", "Board"),
    ]);

    expect(words.map(({ text, count }) => ({ text, count }))).toEqual([
      { text: "Aura", count: 2 },
      { text: "Board", count: 1 },
    ]);
    expect(words[0]?.weight).toBeGreaterThan(words[1]?.weight ?? 0);
  });

  it("orders timeline cards by the date embedded in their content", () => {
    const timeline = buildTimeline([
      card("later", "발표", "2026-08-11"),
      card("earlier", "준비", "2026-07-01"),
      card("undated", "메모", "날짜 없음"),
    ]);

    expect(timeline.map((entry) => entry.card.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});
