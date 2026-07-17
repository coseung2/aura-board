import { describe, expect, it } from "vitest";

import {
  CREATURE_FRAME_COUNT,
  creatureFrameDelay,
  creatureFrameNumber,
  creatureFramePath,
  creatureFramePaths,
} from "./CreatureSprite";
import { resolveBackgroundEffectKey } from "./CreatureHub";

describe("creature sprite frame helpers", () => {
  it("normalizes a frame index into the three canonical frame numbers", () => {
    expect(CREATURE_FRAME_COUNT).toBe(3);
    expect([0, 1, 2, 3, -1].map(creatureFrameNumber)).toEqual([1, 2, 3, 1, 3]);
  });

  it("builds the canonical behavior frame sequence", () => {
    expect(creatureFramePaths("terramote", "juvenile", "signature")).toEqual([
      "/creatures/terramote/juvenile/frames/signature/signature-01.png",
      "/creatures/terramote/juvenile/frames/signature/signature-02.png",
      "/creatures/terramote/juvenile/frames/signature/signature-03.png",
    ]);
    expect(creatureFramePath("", "egg", "normal", 0)).toBeNull();
  });

  it("uses a slower cadence for lazy behavior than active signature motion", () => {
    expect(creatureFrameDelay("lazy")).toBeGreaterThan(creatureFrameDelay("normal"));
    expect(creatureFrameDelay("normal")).toBeGreaterThan(creatureFrameDelay("signature"));
  });

  it("resolves a valid equipped effect and falls back by item key", () => {
    expect(resolveBackgroundEffectKey({ effect: { effectKey: "river-ripples" } })).toBe("river-ripples");
    expect(resolveBackgroundEffectKey({ effect: { effectKey: "unknown" } }, "background-earth-01")).toBe("ground-moss-glow");
    expect(resolveBackgroundEffectKey(null, "background-light-01")).toBe("dawn-aura");
    expect(resolveBackgroundEffectKey({ effect: { effectKey: "unknown" } }, "background-unknown-01")).toBeNull();
  });
});
