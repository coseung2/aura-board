import type { EquippedFloor, SlimeColor, SlimeEvolution } from "./slime-assets";
import type {
  SlimeGrowth,
  SlimeShopFilter,
  SlimeShopItem,
} from "./slime-catalog";
import type { MobileSlimeHome } from "./slime-normalization";
export function shopFilterForItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): Exclude<SlimeShopFilter, "all" | "character"> {
  if (item.category === "background" && item.floor === null)
    return "background";
  // Vehicles are ridden above the floor rather than stood on, so they own the
  // 탈것 tab. `ride` is the pre-vehicle name for the same family.
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "background" || item.floor) return "floor";
  if (item.category === "food") return "food";
  if (item.category === "wearable") return "outfit";
  if (item.category === "level-up") return "level-up";
  return "prop";
}

const STAGE_START_SECONDS: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 10 * 86_400,
  3: 25 * 86_400,
};

export function calculateSlimeGrowthPercent(
  growth: Pick<SlimeGrowth, "stage" | "growthSeconds">,
): number {
  if (growth.stage >= 3) return 100;
  const start = STAGE_START_SECONDS[growth.stage];
  const target = STAGE_START_SECONDS[(growth.stage + 1) as 2 | 3];
  if (target <= start) return 100;
  const percent = ((growth.growthSeconds - start) / (target - start)) * 100;
  // Keep one decimal so a small remainder carried into a new stage does not
  // appear to reset to zero after integer rounding.
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

/** Stage one uses the catalog base buff; later stages double it each time. */
export function slimeBuffBpsForStage(
  baseBuffBps: number,
  stage: 1 | 2 | 3,
): number {
  const base = Number.isFinite(baseBuffBps)
    ? Math.max(0, Math.round(baseBuffBps))
    : 0;
  return stage === 3 ? base * 4 : stage === 2 ? base * 2 : base;
}

export function calculateGrowthTimeComparison(
  remainingEffectiveSeconds: number,
  growthSpeedBps: number,
) {
  const withoutBuffSeconds = Math.max(0, Math.ceil(remainingEffectiveSeconds));
  const safeBps = Number.isFinite(growthSpeedBps)
    ? Math.max(0, Math.round(growthSpeedBps))
    : 0;
  return {
    withoutBuffSeconds,
    withBuffSeconds: Math.ceil(
      (withoutBuffSeconds * 10_000) / (10_000 + safeBps),
    ),
  };
}

export function formatGrowthHours(seconds: number): string {
  const hours = Math.round((Math.max(0, seconds) / 3_600) * 10) / 10;
  return `${hours.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`;
}

export function evolutionForStage(stage: 1 | 2 | 3): SlimeEvolution {
  if (stage === 3) return "gold-crown-red-gem";
  if (stage === 2) return "silver-crown-blue-gem";
  return "base";
}

export function stageForColor(
  home: MobileSlimeHome,
  itemColor: SlimeColor,
): 1 | 2 | 3 {
  return home.growthByColor[itemColor]?.stage ?? 1;
}

export function floorLabel(itemFloor: Exclude<EquippedFloor, "none">): string {
  const labels: Record<Exclude<EquippedFloor, "none">, string> = {
    "grass-floor": "잔디 바닥",
    "crystal-cave-floor": "수정 동굴 바닥",
    "moonlit-marble-floor": "달빛 대리석 바닥",
    "royal-garden-floor": "왕실 정원 바닥",
    "celestial-gold-floor": "천상의 황금 바닥",
    "snow-ground-floor": "눈밭",
    "ancient-brick-floor": "고대 벽돌 바닥",
    "cherry-stone-floor": "벚꽃 돌바닥",
    "sand-trail-floor": "모래길 바닥",
    "forest-soil-floor": "숲 흙바닥",
    "stone-floor": "돌바닥",
    "water-puddle": "물웅덩이",
    trampoline: "트램펄린",
  };
  return labels[itemFloor];
}

export function newSlimeIdempotencyKey(
  prefix: string,
  identity: string,
): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${identity}-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
