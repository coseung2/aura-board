import { describe, expect, it } from "vitest";
import { estimateSongGuessDuration } from "./setup-estimate";

describe("estimateSongGuessDuration", () => {
  it("rejects counts that cannot produce a game", () => {
    expect(estimateSongGuessDuration(0)).toBeNull();
    expect(estimateSongGuessDuration(-1)).toBeNull();
    expect(estimateSongGuessDuration(1.5)).toBeNull();
  });

  it("returns a range that widens with the round count", () => {
    const ten = estimateSongGuessDuration(10);
    const twenty = estimateSongGuessDuration(20);
    expect(ten?.label).toBe("약 5–7분");
    expect(twenty?.minMinutes).toBeGreaterThan(ten!.minMinutes);
    expect(twenty?.maxMinutes).toBeGreaterThan(ten!.maxMinutes);
  });

  it("never reports less than a minute and keeps min below max", () => {
    const single = estimateSongGuessDuration(1);
    expect(single?.minMinutes).toBe(1);
    expect(single?.maxMinutes).toBeGreaterThanOrEqual(single!.minMinutes);
  });
});
