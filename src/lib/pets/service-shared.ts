import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { walkingTitleForStats, type WalkingTitleStats } from "@/lib/walking-titles";
import { getTitleDefinition } from "@/lib/title-catalog";
import { cachedClassroomCurrency } from "./classroom-currency-cache";
import {
  getSlimeDefinition,
  getEquippedSlimeFloor,
  getSlimeShopItem,
  normalizeEquippedSlimeItemKeys,
  slimeVisualItemSlot,
  SLIME_CATALOG,
  SLIME_MAX_PURCHASE_QUANTITY,
  SLIME_SHOP_CATALOG,
} from "./catalog";
import {
  addSlimeGrowthSeconds,
  calculateSlimeGrowthSnapshot,
  normalizeSlimeGrowthStage,
  SLIME_COOKIE_GROWTH_SECONDS,
  settleSlimeGrowth,
  settleSlimeGrowthWithSpeed,
} from "./growth";
import { calculateCatalogSlimeEffects } from "./math";
import {
  SLIME_ITEM_PURCHASE_SOURCE_TYPE,
  SLIME_ITEM_REFUND_SOURCE_TYPE,
  SLIME_COOKIE_USE_SOURCE_TYPE,
  SLIME_PURCHASE_SOURCE_TYPE,
  SLIME_REFUND_SOURCE_TYPE,
  SlimeServiceError,
  type SlimeEquipResult,
  type SlimeHome,
  type SlimeItemRefundResult,
  type SlimeCookieConsumeResult,
  type SlimePurchaseResult,
  type SlimeRefundResult,
  type SlimeShopEquipResult,
  type SlimeShopPurchaseResult,
  type SlimeShopVisibilityResult,
} from "./service-contract";
import {
  growthEffectsForColors,
  growthSnapshotByColor,
  growthStateFromRow,
  slimeGrowthSelect,
  type SlimeGrowthRow,
} from "./service-growth";
import type { SlimeColor, SlimeFloor, SlimeShopItem } from "./types";

export type StudentIdentity = { id: string; classroomId: string };

const RESLOTTED_TRAMPOLINE_KEY = "slime-blue-trampoline";

export function normalizeHiddenItemKeys(
  hiddenItemKeys: readonly string[] | null | undefined,
  equippedItemKeys: readonly string[],
): string[] {
  const equipped = new Set(equippedItemKeys);
  return Array.from(new Set((hiddenItemKeys ?? []).filter((key) => equipped.has(key))));
}

/**
 * Accept inventory written before the trampoline moved from `ride` to
 * `vehicle`. Keep the exception item-specific so a corrupted or unrelated
 * inventory kind still cannot be equipped or refunded.
 */
export function inventoryKindMatchesShopItem(item: SlimeShopItem, itemKind: string): boolean {
  if (itemKind === `slime-${item.category}`) return true;
  return item.key === RESLOTTED_TRAMPOLINE_KEY && itemKind === "slime-ride";
}
export function assertIdempotencyKey(key: string): string {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed || trimmed.length > 200) {
    throw new SlimeServiceError("invalid_body", "Invalid idempotency key");
  }
  return trimmed;
}

export function slimePurchaseSourceRef(studentId: string, idempotencyKey: string): string {
  return `${studentId}:${assertIdempotencyKey(idempotencyKey)}`;
}

export function purchaseNote(color: SlimeColor): string {
  return `slime-purchase:${color}`;
}

export function shopPurchaseNote(itemKey: string): string {
  return `slime-item-purchase:${itemKey}`;
}

export function transactionWhere(studentId: string, sourceRef: string) {
  return {
    sourceType: SLIME_PURCHASE_SOURCE_TYPE,
    sourceRef,
    account: { studentId },
  };
}

export function shopTransactionWhere(studentId: string, sourceRef: string) {
  return {
    sourceType: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
    sourceRef,
    account: { studentId },
  };
}

export function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isPrismaCode(error, "P2034") || attempt >= 3) throw error;
    }
  }
}
