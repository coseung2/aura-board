import { promises as fs } from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { SLIME_ASSET_COLORS, type SlimeColor } from "./slime-assets";
import {
  GROWTH_HEADWEAR_BY_STAGE,
  SLIME_WEARABLE_LAYER_ORDER,
  SLIME_WEARABLE_ROLES,
  resolveSlimeComposition,
  resolveSlimeHeadSlot,
  resolveSlimeWearables,
  slimeWearableOptions,
  slimeWearableTimelineKey,
  type SlimeWearableRole,
} from "./slime-wearables";
import { SLIME_WEB_WEARABLE_REGISTRY } from "./slime-wearables.generated";
import { SLIME_WEB_WEARABLE_ACTION_REGISTRY } from "./slime-wearable-actions.generated";

type Anchor = { sourceFrame: number; dx: number; dy: number };
type Sheet = {
  frameCount: number;
  frameSize: { w: number; h: number };
  characterOffsetY: number;
  grounded: boolean;
  url?: string;
  urlByColor?: Record<string, string>;
};
type RegistryEntry = {
  key: string;
  role: SlimeWearableRole;
  option: string;
  published: boolean;
  vendoredSource: boolean;
  zIndex: number;
  colorSensitive: boolean;
  sheets: Record<string, Sheet>;
  timelines: Record<
    string,
    { sheet: string; anchors: Anchor[]; anchorOverridesByColor?: Record<string, Anchor[]> }
  >;
};

const registry = SLIME_WEB_WEARABLE_REGISTRY as unknown as Record<string, RegistryEntry>;
const publicRoot = path.resolve(__dirname, "..", "..", "..", "public");

type Frame = Map<string, string>;

async function readSheetFrames(
  publicUrl: string,
  frameCount: number,
  frameSize: { w: number; h: number },
): Promise<Frame[]> {
  const filePath = path.join(publicRoot, publicUrl.replace(/^\//, ""));
  const png = PNG.sync.read(await fs.readFile(filePath));
  expect(png.width).toBe(frameSize.w * frameCount);
  expect(png.height).toBe(frameSize.h);
  const frames: Frame[] = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pixels: Frame = new Map();
    for (let y = 0; y < frameSize.h; y += 1) {
      for (let x = 0; x < frameSize.w; x += 1) {
        const offset = (y * png.width + frameIndex * frameSize.w + x) * 4;
        if (png.data[offset + 3] === 0) continue;
        pixels.set(
          `${x},${y}`,
          `${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]},${png.data[offset + 3]}`,
        );
      }
    }
    frames.push(pixels);
  }
  return frames;
}

describe("slime wearable anchor registry", () => {
  it("imports every delivered happy and ball-hit action without an idle fallback", () => {
    const actions = SLIME_WEB_WEARABLE_ACTION_REGISTRY as unknown as Record<
      string,
      { timelines: Record<string, { anchors: Anchor[] }> }
    >;
    const happy = Object.entries(actions).filter(([, entry]) => entry.timelines.happy);
    const ballHit = Object.entries(actions).filter(([, entry]) => entry.timelines["ball-hit"]);

    expect(happy).toHaveLength(16);
    expect(ballHit).toHaveLength(22);
    for (const [key, entry] of ballHit) {
      expect(entry.timelines["ball-hit"].anchors).toHaveLength(18);
      const [role, option] = key.split("/") as [SlimeWearableRole, string];
      expect(resolveSlimeWearables(
        { [role]: option },
        "blue",
        "ball-hit" as SlimeSheetAction,
        5,
      )).toEqual([
        expect.objectContaining({ key, sourceFrame: 5, sheetFrameCount: 18 }),
      ]);
    }
  });

  it("covers every role in the source composition contract order", () => {
    expect(SLIME_WEARABLE_LAYER_ORDER).toEqual(["slime", ...SLIME_WEARABLE_ROLES]);
    const roles = new Set(Object.values(registry).map((entry) => entry.role));
    expect([...roles].sort()).toEqual([...SLIME_WEARABLE_ROLES].sort());
  });

  it("agrees on anchor track length across every color of a timeline", () => {
    for (const entry of Object.values(registry)) {
      for (const [timeline, track] of Object.entries(entry.timelines)) {
        for (const overrides of Object.values(track.anchorOverridesByColor ?? {})) {
          expect(overrides, `${entry.key} ${timeline} override`).toHaveLength(track.anchors.length);
        }
      }
    }
  });

  it("points every anchor at a real column of the sheet it references", () => {
    for (const entry of Object.values(registry)) {
      for (const [timeline, track] of Object.entries(entry.timelines)) {
        const sheet = entry.sheets[track.sheet];
        expect(sheet, `${entry.key} ${timeline} -> ${track.sheet}`).toBeTruthy();
        const anchorSets = [track.anchors, ...Object.values(track.anchorOverridesByColor ?? {})];
        for (const anchors of anchorSets) {
          for (const anchor of anchors) {
            expect(anchor.sourceFrame).toBeGreaterThanOrEqual(0);
            expect(anchor.sourceFrame).toBeLessThan(sheet.frameCount);
            expect(Math.abs(anchor.dx)).toBeLessThanOrEqual(sheet.frameSize.w);
            expect(Math.abs(anchor.dy)).toBeLessThanOrEqual(sheet.frameSize.h);
          }
        }
      }
    }
  });

  it("reuses the idle sheet for drink timelines and keeps happy on its own", () => {
    const strawHat = registry["headwear/straw-hat"];
    // Drinks replay the idle sheet, so a new flavor needs no new art. The jump
    // actions have their own canvas and therefore their own stored sheets.
    expect(Object.keys(strawHat.sheets).sort()).toEqual(["idle", "trampoline", "water-puddle"]);
    for (const [timeline, track] of Object.entries(strawHat.timelines)) {
      if (timeline === "water-puddle" || timeline === "trampoline") {
        expect(track.sheet, timeline).toBe(timeline);
      } else {
        expect(track.sheet, timeline).toBe("idle");
      }
    }

    // The happy animation has a different frame count, so its 12 columns cannot
    // be addressed from the 8-column idle sheet.
    const crown = registry["headwear/gold-crown-red-gem"];
    expect(Object.keys(crown.sheets).sort()).toEqual(["happy", "idle"]);
    expect(crown.sheets.idle.frameCount).toBe(8);
    expect(crown.sheets.happy.frameCount).toBe(12);
    expect(crown.timelines.happy.sheet).toBe("happy");
    expect(crown.timelines.happy.anchors).toHaveLength(12);
  });

  it("exposes finished wearable roles while keeping growth crowns out of the shop", () => {
    const headwear = slimeWearableOptions("headwear");
    expect(headwear).toHaveLength(40);
    expect(headwear).toEqual(expect.arrayContaining([
      "caramel-puppy-ear-headband",
      "cream-bunny-ear-headband",
      "mauve-cat-ear-headband",
      "pearl-ribbon-headband",
    ]));
    expect(slimeWearableOptions("eyewear")).toHaveLength(18);
    expect(slimeWearableOptions("blush")).toEqual([
      "peach-brush-blush",
      "rose-brush-blush",
    ]);
  });

  it("stores one shared sheet per wearable option and per-color drink sheets", () => {
    for (const entry of Object.values(registry)) {
      for (const [timeline, sheet] of Object.entries(entry.sheets)) {
        if (entry.role === "drink") {
          expect(entry.colorSensitive, entry.key).toBe(true);
          expect(Object.keys(sheet.urlByColor ?? {}).sort(), `${entry.key} ${timeline}`).toEqual(
            [...SLIME_ASSET_COLORS].sort(),
          );
        } else {
          expect(entry.colorSensitive, entry.key).toBe(false);
          expect(sheet.url, `${entry.key} ${timeline}`).toBeTruthy();
        }
      }
    }
  });

  it("marks growth-awarded crowns unpurchasable and sourced from the vendored bridge", () => {
    for (const option of Object.values(GROWTH_HEADWEAR_BY_STAGE)) {
      const entry = registry[`headwear/${option}`];
      expect(entry, option).toBeTruthy();
      expect(entry.published, option).toBe(false);
      expect(entry.vendoredSource, option).toBe(true);
    }
    expect(slimeWearableOptions("headwear")).not.toContain("gold-crown-red-gem");
  });
});

describe("slime wearable resolution", () => {
  it("maps only authored actions to a wearable timeline", () => {
    expect(slimeWearableTimelineKey("idle")).toBe("idle");
    expect(slimeWearableTimelineKey("happy")).toBe("happy");
    expect(slimeWearableTimelineKey("ball-hit")).toBe("ball-hit");
    expect(slimeWearableTimelineKey("drink", "lemonade")).toBe("drink:lemonade");
    // A drink needs its flavor to name a timeline.
    expect(slimeWearableTimelineKey("drink")).toBeNull();
    // Jump actions now have overlays on their own taller canvas.
    expect(slimeWearableTimelineKey("water-puddle")).toBe("water-puddle");
    expect(slimeWearableTimelineKey("trampoline")).toBe("trampoline");
  });

  it("ships every new headband for idle, happy, drinks, and both jump actions", () => {
    const options = [
      "pearl-ribbon-headband",
      "caramel-puppy-ear-headband",
      "cream-bunny-ear-headband",
      "mauve-cat-ear-headband",
    ] as const;
    for (const option of options) {
      expect(resolveSlimeWearables({ headwear: option }, "green", "idle", 0), option).toHaveLength(1);
      expect(resolveSlimeWearables({ headwear: option }, "green", "drink", 0, "lemonade"), option).toHaveLength(1);
      for (const action of ["water-puddle", "trampoline"] as const) {
        const [layer] = resolveSlimeWearables({ headwear: option }, "green", action, 13);
        expect(layer, `${option} ${action}`).toMatchObject({
          option,
          grounded: false,
          characterOffsetY: 17,
          sheetFrameCount: 26,
        });
      }
      const [happy] = resolveSlimeWearables({ headwear: option }, "green", "happy", 11);
      expect(happy, `${option} happy`).toMatchObject({
        option,
        grounded: true,
        characterOffsetY: 0,
        sheetFrameCount: 12,
      });
    }
  });

  it("returns layers ordered bottom to top by the contract z-index", () => {
    const resolved = resolveSlimeWearables(
      { headwear: "straw-hat", eyewear: "round-glasses", drink: "lemonade" },
      "blue",
      "drink",
      0,
      "lemonade",
    );
    expect(resolved.map((layer) => layer.role)).toEqual(["eyewear", "headwear", "drink"]);
    for (let index = 1; index < resolved.length; index += 1) {
      expect(resolved[index].zIndex).toBeGreaterThan(resolved[index - 1].zIndex);
    }
  });

  it("keeps a legacy hat attached through happy and ball-hit", () => {
    for (const action of ["happy", "ball-hit"] as const) {
      const layers = resolveSlimeWearables({ headwear: "straw-hat" }, "blue", action, 5);
      expect(layers, action).toEqual([
        expect.objectContaining({
          key: "headwear/straw-hat",
          sourceFrame: 5,
          sheetFrameCount: action === "happy" ? 12 : 18,
        }),
      ]);
    }
  });

  it("ships all 40 batch-v2 wearables with their own ball-hit track", () => {
    const entries = Object.values(registry).filter(
      (entry) =>
        (entry.role === "headwear" || entry.role === "eyewear") &&
        entry.timelines["ball-hit"],
    );
    expect(entries.filter((entry) => entry.role === "headwear")).toHaveLength(29);
    expect(entries.filter((entry) => entry.role === "eyewear")).toHaveLength(11);
    for (const entry of entries) {
      const [layer] = resolveSlimeWearables(
        { [entry.role]: entry.option },
        "blue",
        "ball-hit",
        9,
      );
      expect(layer, entry.key).toMatchObject({
        role: entry.role,
        option: entry.option,
        grounded: true,
        characterOffsetY: 0,
        sheetFrameCount: 18,
      });
    }
  });

  it("renders the growth crown on the happy timeline it does have", () => {
    const layers = resolveSlimeWearables(
      { headwear: "gold-crown-red-gem" },
      "blue",
      "happy",
      5,
    );
    expect(layers).toHaveLength(1);
    expect(layers[0]?.sheetFrameCount).toBe(12);
  });

  it("keeps green drink-lemonade aligned with the shared anchor track", () => {
    const green = resolveSlimeWearables({ headwear: "straw-hat" }, "green", "drink", 0, "lemonade");
    const blue = resolveSlimeWearables({ headwear: "straw-hat" }, "blue", "drink", 0, "lemonade");
    expect(green[0]?.dy).toBe(0);
    expect(blue[0]?.dy).toBe(0);
    for (const entry of Object.values(registry)) {
      for (const timeline of Object.values(entry.timelines)) {
        expect(timeline.anchorOverridesByColor).toBeUndefined();
      }
    }
  });

  it("wraps frame indexes instead of falling off the end of a track", () => {
    const first = resolveSlimeWearables({ headwear: "straw-hat" }, "blue", "idle", 0);
    const wrapped = resolveSlimeWearables({ headwear: "straw-hat" }, "blue", "idle", 8);
    expect(wrapped).toEqual(first);
  });
});

describe("head slot gives a chosen hat priority over the growth crown", () => {
  it("awards a crown by growth stage when nothing is equipped", () => {
    expect(resolveSlimeHeadSlot(1, null)).toBeNull();
    expect(resolveSlimeHeadSlot(2, null)).toEqual({
      option: "silver-crown-blue-gem",
      source: "growth",
    });
    expect(resolveSlimeHeadSlot(3, null)).toEqual({
      option: "gold-crown-red-gem",
      source: "growth",
    });
  });

  it("lets a chosen hat win at any stage and restores the crown when removed", () => {
    expect(resolveSlimeHeadSlot(3, "straw-hat")).toEqual({
      option: "straw-hat",
      source: "equipped",
    });
    // Removing the hat is the same call with no equipped option.
    expect(resolveSlimeHeadSlot(3, null)?.option).toBe("gold-crown-red-gem");
  });

  it("composes idle and drink for a chosen hat", () => {
    const headSlot = resolveSlimeHeadSlot(3, "straw-hat");
    expect(resolveSlimeComposition("idle", headSlot)).toEqual({
      mode: "composed",
      headwear: "drawn",
    });
    expect(resolveSlimeComposition("drink", headSlot, "lemonade")).toEqual({
      mode: "composed",
      headwear: "drawn",
    });
    // Jump actions have their own authored hat tracks, so hats stay on.
    for (const action of ["water-puddle", "trampoline"] as const) {
      expect(resolveSlimeComposition(action, headSlot), action).toEqual({
        mode: "composed",
        headwear: "drawn",
      });
    }
  });

  it("keeps a chosen legacy hat drawn during happy", () => {
    const headSlot = resolveSlimeHeadSlot(3, "straw-hat");
    expect(resolveSlimeComposition("happy", headSlot)).toEqual({
      mode: "composed",
      headwear: "drawn",
    });
  });

  it("keeps a new headband drawn during happy", () => {
    const headSlot = resolveSlimeHeadSlot(3, "pearl-ribbon-headband");
    expect(resolveSlimeComposition("happy", headSlot)).toEqual({
      mode: "composed",
      headwear: "drawn",
    });
  });

  it("keeps the growth crown on idle, happy, and every semantic drink", () => {
    const headSlot = resolveSlimeHeadSlot(3, null);
    // The crown has idle and happy tracks.
    for (const action of ["idle", "happy"] as const) {
      expect(resolveSlimeComposition(action, headSlot), action).toEqual({
        mode: "composed",
        headwear: "drawn",
      });
    }
    // Jump tracks still need separate taller-canvas art, so only those suppress
    // the crown layer.
    for (const action of ["water-puddle", "trampoline"] as const) {
      expect(resolveSlimeComposition(action, headSlot), action).toEqual({
        mode: "composed",
        headwear: "suppressed",
        reason: "unsupported-action",
      });
    }
    expect(resolveSlimeComposition("drink", headSlot, "grape-soda")).toEqual({
      mode: "composed",
      headwear: "drawn",
    });
  });

  it("leaves an unequipped stage-1 slime bare-headed but still composing", () => {
    const headSlot = resolveSlimeHeadSlot(1, null);
    expect(headSlot).toBeNull();
    expect(resolveSlimeComposition("idle", headSlot)).toEqual({
      mode: "composed",
      headwear: "empty",
    });
  });
});

describe("jump actions are kept distinct from grounded actions", () => {
  /**
   * Jump overlays are authored on a taller canvas with headroom above the
   * grounded pose. Confusing the two families would offset every jump wearable by
   * that headroom, so the registry records the canvas and the offset per sheet.
   */
  const JUMP_TIMELINES = ["water-puddle", "trampoline"] as const;

  it("marks jump sheets as ungrounded with a taller canvas and a real offset", () => {
    const hat = registry["headwear/straw-hat"];
    for (const timeline of JUMP_TIMELINES) {
      const sheet = hat.sheets[timeline];
      expect(sheet, timeline).toBeTruthy();
      expect(sheet.grounded, timeline).toBe(false);
      expect(sheet.frameSize.h, timeline).toBe(81);
      expect(sheet.characterOffsetY, timeline).toBe(17);
      expect(sheet.frameCount, timeline).toBe(26);
    }
  });

  it("keeps grounded sheets on the character canvas with no offset", () => {
    const hat = registry["headwear/straw-hat"];
    for (const timeline of ["idle"] as const) {
      const sheet = hat.sheets[timeline];
      expect(sheet.grounded, timeline).toBe(true);
      expect(sheet.frameSize.h, timeline).toBe(64);
      expect(sheet.characterOffsetY, timeline).toBe(0);
    }
  });

  it("never lets a jump timeline read a grounded sheet or the reverse", () => {
    for (const entry of Object.values(registry)) {
      for (const [timeline, track] of Object.entries(entry.timelines)) {
        const sheet = entry.sheets[track.sheet];
        const timelineIsJump = (JUMP_TIMELINES as readonly string[]).includes(timeline);
        expect(sheet.grounded, `${entry.key} ${timeline}`).toBe(!timelineIsJump);
      }
    }
  });

  it("resolves a jump wearable with the offset applied", () => {
    const [layer] = resolveSlimeWearables(
      { headwear: "straw-hat" },
      "blue",
      "trampoline",
      3,
    );
    expect(layer).toBeTruthy();
    expect(layer.grounded).toBe(false);
    expect(layer.characterOffsetY).toBe(17);
    expect(layer.sheetFrameCount).toBe(26);
    expect(layer.sheetHeight).toBe(81);
  });

  it("keeps a hat on during jumps while suppressing the crown that lacks the track", () => {
    const withHat = resolveSlimeHeadSlot(3, "straw-hat");
    const crownOnly = resolveSlimeHeadSlot(3, null);
    for (const action of JUMP_TIMELINES) {
      expect(resolveSlimeComposition(action, withHat), action).toEqual({
        mode: "composed",
        headwear: "drawn",
      });
      expect(resolveSlimeComposition(action, crownOnly), action).toEqual({
        mode: "composed",
        headwear: "suppressed",
        reason: "unsupported-action",
      });
    }
  });
});

describe("shipped idle sheets back every drink timeline", () => {
  /**
   * The authored drink overlay sheets are not shipped: they are reproducible
   * from each option's idle sheet plus its anchor track, and the importer proves
   * that pixel for pixel against the source package before dropping them.
   *
   * This test cannot repeat that comparison, because the authored sheets only
   * exist in the external asset package. What it does assert is the runtime half
   * of the contract: every drink frame resolves to the anchor the registry
   * declares, and every anchor points at a source column that actually carries
   * pixels in the shipped idle sheet. A dropped or truncated sheet fails here.
   */
  it("resolves every drink frame to a populated column of the shipped idle sheet", async () => {
    let comparedFrames = 0;
    for (const entry of Object.values(registry)) {
      if (entry.colorSensitive) continue;
      const idleSheet = entry.sheets.idle;
      if (!idleSheet?.url) continue;
      const idleFrames = await readSheetFrames(idleSheet.url, idleSheet.frameCount, idleSheet.frameSize);
      expect(entry.timelines.idle?.anchors.map((anchor) => anchor.sourceFrame)).toEqual(
        idleFrames.map((_, index) => index),
      );

      for (const color of SLIME_ASSET_COLORS as readonly SlimeColor[]) {
        for (const [timeline, track] of Object.entries(entry.timelines)) {
          if (!timeline.startsWith("drink:")) continue;
          expect(track.sheet, `${entry.key} ${timeline}`).toBe("idle");
          const anchors = track.anchorOverridesByColor?.[color] ?? track.anchors;
          const flavor = timeline.slice("drink:".length);
          for (let frameIndex = 0; frameIndex < anchors.length; frameIndex += 1) {
            const [layer] = resolveSlimeWearables(
              { [entry.role]: entry.option },
              color,
              "drink",
              frameIndex,
              flavor,
            );
            expect(layer, `${entry.key} ${timeline} ${color} ${frameIndex}`).toBeTruthy();
            expect(layer.sourceFrame).toBe(anchors[frameIndex].sourceFrame);
            expect(layer.dx).toBe(anchors[frameIndex].dx);
            expect(layer.dy).toBe(anchors[frameIndex].dy);
            expect(idleFrames[layer.sourceFrame].size).toBeGreaterThan(0);
            comparedFrames += 1;
          }
        }
      }
    }
    // 60 authored wearable options plus 2 growth crowns, across 5 colors,
    // 5 drink flavors, and 8 frames.
    expect(comparedFrames).toBe(62 * 5 * 5 * 8);
  });
});
