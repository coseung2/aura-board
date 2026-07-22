import type { SLIME_CATALOG, SLIME_SHOP_CATALOG } from "./catalog";
import type { SlimeGrowthSnapshot } from "./growth";
import type { calculateCatalogSlimeEffects } from "./math";
import type { SlimeColor, SlimeFloor } from "./types";

export const SLIME_PURCHASE_SOURCE_TYPE = "slime_purchase" as const;
export const SLIME_ITEM_PURCHASE_SOURCE_TYPE = "slime_item_purchase" as const;
export const SLIME_REFUND_SOURCE_TYPE = "slime_refund" as const;
export const SLIME_ITEM_REFUND_SOURCE_TYPE = "slime_item_refund" as const;
export const SLIME_COOKIE_USE_SOURCE_TYPE = "slime_cookie_use" as const;

export type SlimeServiceErrorCode =
  | "invalid_body"
  | "unknown_slime"
  | "account_not_found"
  | "insufficient_funds"
  | "already_owned"
  | "unknown_item"
  | "not_owned"
  | "not_refundable"
  | "idempotency_key_reused";

const ERROR_STATUS: Record<SlimeServiceErrorCode, number> = {
  invalid_body: 400,
  unknown_slime: 400,
  account_not_found: 404,
  insufficient_funds: 402,
  already_owned: 409,
  unknown_item: 400,
  not_owned: 403,
  not_refundable: 409,
  idempotency_key_reused: 409,
};

export class SlimeServiceError extends Error {
  readonly code: SlimeServiceErrorCode;
  readonly status: number;

  constructor(code: SlimeServiceErrorCode, message: string = code) {
    super(message);
    this.name = "SlimeServiceError";
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

export function isSlimeServiceError(
  error: unknown,
): error is SlimeServiceError {
  return error instanceof SlimeServiceError;
}

export type SlimeHome = {
  balance: number;
  currency: { unitLabel: string };
  ownedColors: SlimeColor[];
  equippedColors: SlimeColor[];
  representativeColor: SlimeColor | null;
  catalog: typeof SLIME_CATALOG;
  ownedItemKeys: string[];
  ownedItemQuantities: Record<string, number>;
  equippedItemKeys: string[];
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor: Partial<Record<SlimeColor, SlimeFloor>>;
  /** Floor equipped by the representative slime, or none. */
  equippedFloor: SlimeFloor;
  shopCatalog: typeof SLIME_SHOP_CATALOG;
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
  growthSpeedBps: number;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowthSnapshot>>;
  growth: Partial<Record<SlimeColor, SlimeGrowthSnapshot>>;
  /** The highest walking achievement title currently earned by the student. */
  walkingTitle: { key: string; label: string; imagePath: string } | null;
};

export type SlimePurchaseResult = {
  ownedColor: SlimeColor;
  balance: number;
  idempotent: boolean;
};

export type SlimeShopPurchaseResult = {
  ownedItemKey: string;
  balance: number;
  idempotent: boolean;
};

export type SlimeShopEquipResult = {
  slimeColor: SlimeColor;
  itemKey: string;
  isEquipped: boolean;
  equippedItemKeys: string[];
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor: Partial<Record<SlimeColor, SlimeFloor>>;
  /** Floor equipped by the representative slime, or none. */
  equippedFloor: SlimeFloor;
  idempotent: boolean;
};

export type SlimeEquipResult = {
  slimeColor: SlimeColor;
  isEquipped: boolean;
  equippedColors: SlimeColor[];
  growthSpeedBps: number;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowthSnapshot>>;
  /** Alias kept for mobile callers that use the shorter payload key. */
  growth: Partial<Record<SlimeColor, SlimeGrowthSnapshot>>;
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
};

export type SlimeRefundResult = {
  refundedColor: SlimeColor;
  balance: number;
  representativeColor: SlimeColor | null;
};

export type SlimeItemRefundResult = {
  refundedItemKey: string;
  balance: number;
};

export type SlimeCookieConsumeResult = {
  itemKey: "slime-cookie";
  remainingQuantity: number;
  growth: SlimeGrowthSnapshot;
};
