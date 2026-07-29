import { SLIME_MOBILE_BALL_PROP_REGISTRY } from "./slime-props.generated";
import type { SlimeAction, SlimeColor } from "./slime-assets";
import type { SlimeShopItem } from "./slimes";

export const SLIME_BALL_SLUGS = [
  "american-football",
  "baseball",
  "basketball",
  "black-ball",
  "dark-blue-ball",
  "soccer-ball",
  "tennis-ball",
] as const;

export type SlimeBallSlug = (typeof SLIME_BALL_SLUGS)[number];

/** One selected prop action. It yields briefly to an explicit happy interaction. */
export type SlimePropAction =
  | Readonly<{ kind: "drink"; itemKey: string; flavor: string }>
  | Readonly<{ kind: "ball"; itemKey: string; slug: SlimeBallSlug }>;

export type ResolvedSlimePropAction = Readonly<{
  prop: SlimePropAction | null;
  characterAction: SlimeAction;
  wearableAction: "idle" | "happy" | "drink" | "water-puddle" | "trampoline" | "ball-hit";
  priority: 0 | 100 | 200;
}>;

type BallRegistryEntry = (typeof SLIME_MOBILE_BALL_PROP_REGISTRY)[keyof typeof SLIME_MOBILE_BALL_PROP_REGISTRY];

function ballSlug(itemKey: string): SlimeBallSlug | null {
  if (!itemKey.startsWith("slime-ball-")) return null;
  const slug = itemKey.slice("slime-ball-".length);
  return (SLIME_BALL_SLUGS as readonly string[]).includes(slug) ? slug as SlimeBallSlug : null;
}

/** Resolve conflicting equipped props without changing the persisted equipment. */
export function resolveEquippedSlimePropAction(
  itemKeys: readonly string[],
  catalog: readonly SlimeShopItem[],
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
  return candidates.sort((first, second) => {
    const kindPriority = (kind: SlimePropAction["kind"]) => kind === "ball" ? 2 : 1;
    return kindPriority(second.kind) - kindPriority(first.kind)
      || first.itemKey.localeCompare(second.itemKey);
  })[0] ?? null;
}

export function resolveSlimePropAction(
  ambientAction: SlimeAction,
  prop: SlimePropAction | null | undefined,
  equippedFloor: string,
): ResolvedSlimePropAction {
  // Feeding is a direct player interaction. Let its one-shot animation finish,
  // then the caller restores the continuously equipped prop action.
  if (ambientAction === "happy") {
    return { prop: null, characterAction: "happy", wearableAction: "happy", priority: 0 };
  }
  if (prop?.kind === "drink") {
    return { prop, characterAction: "drink", wearableAction: "drink", priority: 100 };
  }
  if (prop?.kind === "ball") {
    return { prop, characterAction: "idle", wearableAction: "ball-hit", priority: 200 };
  }
  const wearableAction = ambientAction === "floor-interaction"
    && (equippedFloor === "water-puddle" || equippedFloor === "trampoline")
    ? equippedFloor
    : "idle";
  return { prop: null, characterAction: ambientAction, wearableAction, priority: 0 };
}

export function resolveSlimeBallPropAsset(slug: SlimeBallSlug, color: SlimeColor): BallRegistryEntry {
  const entry = SLIME_MOBILE_BALL_PROP_REGISTRY[`${slug}/${color}` as keyof typeof SLIME_MOBILE_BALL_PROP_REGISTRY];
  if (!entry) throw new Error(`Missing mobile slime ball prop: ${slug}/${color}`);
  return entry;
}

export function slimePropFrameOffset(
  frameIndex: number,
  entry: Readonly<{
    columns: number;
    frameCount: number;
    frameSize: number;
    imageScale: number;
  }>,
  displayScale: number,
) {
  const index = ((Math.trunc(frameIndex) % entry.frameCount) + entry.frameCount) % entry.frameCount;
  const column = index % entry.columns;
  const row = Math.floor(index / entry.columns);
  return {
    left: column === 0 ? 0 : -column * entry.frameSize * entry.imageScale * displayScale,
    top: row === 0 ? 0 : -row * entry.frameSize * entry.imageScale * displayScale,
  };
}
