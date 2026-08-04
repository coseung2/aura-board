import {
  resolveSlimeBallAsset,
  type SlimeAction,
  type SlimeColor,
} from "./slime-assets";
import type { SlimeBallSlug } from "./types";

/**
 * Web prop-action contract mirrored from apps/mobile/lib/slime-props.ts.
 *
 * Equipped pet cards pass a prop action instead of replacing the character with
 * a complete GIF. Balls keep the layered action/overlay sheets; drinks keep the
 * character drink sheet plus a clipped wearable prop.
 */

export const SLIME_BALL_SLUGS = [
  "american-football",
  "baseball",
  "basketball",
  "black-ball",
  "dark-blue-ball",
  "soccer-ball",
  "tennis-ball",
] as const;

export type { SlimeBallSlug };

/** One selected prop action. It yields briefly to an explicit happy interaction. */
export type SlimePropAction =
  | Readonly<{ kind: "drink"; itemKey: string; flavor: string }>
  | Readonly<{ kind: "ball"; itemKey: string; slug: SlimeBallSlug }>;

export type SlimeWearableAction =
  | "idle"
  | "happy"
  | "drink"
  | "water-puddle"
  | "trampoline"
  | "ball-hit";

export type ResolvedSlimePropAction = Readonly<{
  prop: SlimePropAction | null;
  characterAction: SlimeAction;
  wearableAction: SlimeWearableAction;
  priority: 0 | 100 | 200;
}>;

/**
 * Mobile ball props are authored on a 96px scene cell (64 character + 16 inset).
 * Web stores nearest-downscaled 1x sheets under the same public ball folder.
 */
export type SlimeBallPropAsset = Readonly<{
  slug: SlimeBallSlug;
  color: SlimeColor;
  frameCount: number;
  sourceFrameSize: number;
  frameSize: number;
  sceneInset: number;
  columns: number;
  imageScale: 1;
  durations: readonly number[];
  actionSheetUrl: string;
  overlaySheetUrl: string;
  sheetWidth: number;
  sheetHeight: number;
}>;

type CatalogLike = Readonly<{
  key: string;
  category?: string;
  animationKey?: string;
}>;

function ballSlug(itemKey: string): SlimeBallSlug | null {
  if (!itemKey.startsWith("slime-ball-")) return null;
  const slug = itemKey.slice("slime-ball-".length);
  return (SLIME_BALL_SLUGS as readonly string[]).includes(slug)
    ? (slug as SlimeBallSlug)
    : null;
}

/** Resolve conflicting equipped props without changing the persisted equipment. */
export function resolveEquippedSlimePropAction(
  itemKeys: readonly string[],
  catalog: readonly CatalogLike[],
): SlimePropAction | null {
  const byKey = new Map(catalog.map((item) => [item.key, item]));
  const candidates = itemKeys.flatMap((itemKey): SlimePropAction[] => {
    const slug = ballSlug(itemKey);
    if (slug) return [{ kind: "ball", itemKey, slug }];
    const item = byKey.get(itemKey);
    return item?.category === "drink" && item.animationKey
      ? [{ kind: "drink", itemKey, flavor: item.animationKey }]
      : [];
  });
  return (
    candidates.sort((first, second) => {
      const kindPriority = (kind: SlimePropAction["kind"]) =>
        kind === "ball" ? 2 : 1;
      return (
        kindPriority(second.kind) - kindPriority(first.kind) ||
        first.itemKey.localeCompare(second.itemKey)
      );
    })[0] ?? null
  );
}

export function resolveSlimePropAction(
  ambientAction: SlimeAction,
  prop: SlimePropAction | null | undefined,
  equippedFloor: string,
): ResolvedSlimePropAction {
  // Feeding is a direct player interaction. Let its one-shot animation finish,
  // then the caller restores the continuously equipped prop action.
  if (ambientAction === "happy") {
    return {
      prop: null,
      characterAction: "happy",
      wearableAction: "happy",
      priority: 0,
    };
  }
  if (prop?.kind === "drink") {
    return {
      prop,
      characterAction: "drink",
      wearableAction: "drink",
      priority: 100,
    };
  }
  if (prop?.kind === "ball") {
    return {
      prop,
      characterAction: "idle",
      wearableAction: "ball-hit",
      priority: 200,
    };
  }
  const wearableAction: SlimeWearableAction =
    ambientAction === "floor-interaction" &&
    (equippedFloor === "water-puddle" || equippedFloor === "trampoline")
      ? equippedFloor
      : ambientAction === "drink"
        ? "drink"
        : "idle";
  return {
    prop: null,
    characterAction: ambientAction,
    wearableAction,
    priority: 0,
  };
}

/**
 * Resolve the layered web ball prop sheets.
 *
 * Source metadata still comes from the official 64px hit sheet so durations stay
 * authoritative. The action/overlay sheets are the mobile-separated 96px cells,
 * nearest-downscaled to logical 1x for the integer web renderer.
 */
export function resolveSlimeBallPropAsset(
  slug: SlimeBallSlug,
  color: SlimeColor,
): SlimeBallPropAsset {
  const hit = resolveSlimeBallAsset(color, slug);
  const frameCount = hit.frameCount;
  const columns = 6;
  const frameSize = 96;
  const rows = Math.ceil(frameCount / columns);
  return {
    slug,
    color,
    frameCount,
    sourceFrameSize: 64,
    frameSize,
    sceneInset: 16,
    columns,
    imageScale: 1,
    durations: hit.metadata.frames.map((frame) => frame.duration),
    actionSheetUrl: `/creatures/slimes/official/props/ball/${slug}/${color}/action-sheet.png`,
    overlaySheetUrl: `/creatures/slimes/official/props/ball/${slug}/${color}/prop-sheet.png`,
    sheetWidth: columns * frameSize,
    sheetHeight: rows * frameSize,
  };
}

export function slimePropFrameOffset(
  frameIndex: number,
  entry: Readonly<{
    columns: number;
    frameCount: number;
    frameSize: number;
    imageScale: number;
  }>,
  rendererScale: number,
) {
  const index =
    ((Math.trunc(frameIndex) % entry.frameCount) + entry.frameCount) %
    entry.frameCount;
  const column = index % entry.columns;
  const row = Math.floor(index / entry.columns);
  return {
    left:
      column === 0
        ? 0
        : -column * entry.frameSize * entry.imageScale * rendererScale,
    top:
      row === 0
        ? 0
        : -row * entry.frameSize * entry.imageScale * rendererScale,
  };
}
