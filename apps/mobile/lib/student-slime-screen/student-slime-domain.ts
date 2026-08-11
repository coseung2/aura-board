import type { EquippedFloor } from "../slime-assets";
import type { ImageProps } from "expo-image";
import type { MobileSlimeHome } from "../slimes";
import type { SlimeColor } from "../slime-assets";
import type { SlimeShopItem } from "../slimes";
import { ApiError } from "../api";

export type Notice = { kind: "success" | "error"; text: string };

export type SlimeEquipResponse = Pick<
  MobileSlimeHome,
  | "equippedItemKeys"
  | "equippedItemsByColor"
  | "hiddenItemKeys"
  | "hiddenItemsByColor"
  | "equippedFloorByColor"
  | "equippedFloor"
>;

export type SlimeCookieConsumeResponse = {
  itemKey: string;
  remainingQuantity: number;
  growth: NonNullable<MobileSlimeHome["growthByColor"][SlimeColor]>;
};

export type SlimeVisibilityResponse = Pick<
  MobileSlimeHome,
  "hiddenItemKeys" | "hiddenItemsByColor"
> & {
  slimeColor: SlimeColor;
  itemKey: string;
  isHidden: boolean;
};

export type LocalImageSource = ImageProps["source"];

export const DISABLED_COOKIE_SOURCE = require("../../assets/slimes/shared/cookie-shop-icon-256-disabled.png");

export const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

export const ERROR_LABELS: Record<string, string> = {
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 보유한 상품이에요.",
  unknown_item: "상품을 찾을 수 없어요.",
  not_owned: "먼저 상품을 구매해 주세요.",
  idempotency_key_reused:
    "같은 요청 키가 다른 상품에 사용됐어요. 다시 시도해 주세요.",
  account_not_found: "학생 지갑을 찾을 수 없어요.",
  invalid_body: "요청을 확인해 주세요.",
  request_timeout: "요청 시간이 초과됐어요. 다시 눌러 주세요.",
};

export const FLOOR_ORDER: Exclude<EquippedFloor, "none">[] = [
  "grass-floor",
  "crystal-cave-floor",
  "moonlit-marble-floor",
  "royal-garden-floor",
  "celestial-gold-floor",
  "snow-ground-floor",
  "ancient-brick-floor",
  "cherry-stone-floor",
  "sand-trail-floor",
  "forest-soil-floor",
  "stone-floor",
  "water-puddle",
  "trampoline",
];

export const SLIME_EFFECT_LABELS: Record<string, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 보상",
  comment_reward: "댓글 보상",
};

export const SLIME_EFFECT_DESCRIPTIONS: Record<string, string> = {
  growth_speed: "펫의 성장 속도가 UP!",
  reading_reward: "독서로 얻을 수 있는 보상이 UP!",
  walking_reward: "걷기로 얻을 수 있는 보상이 UP!",
  assignment_reward: "과제 제출 날짜를 지켰을 때의 보상이 UP!",
  comment_reward: "게시물에 댓글을 달았을 때의 보상이 UP!",
};

export function formatBuffPercent(bps: number): string {
  return `${(bps / 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

export function localSource(value: unknown): LocalImageSource {
  return value as LocalImageSource;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.body && typeof error.body === "object" && "error" in error.body) {
      const code = (error.body as { error?: unknown }).error;
      if (typeof code === "string")
        return ERROR_LABELS[code] ?? `요청에 실패했어요 (${code})`;
    }
    return ERROR_LABELS[error.message] ?? error.message;
  }
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}

export function itemFloor(
  item: SlimeShopItem,
): Exclude<EquippedFloor, "none"> | null {
  return item.floor && (FLOOR_ORDER as readonly string[]).includes(item.floor)
    ? item.floor
    : null;
}
