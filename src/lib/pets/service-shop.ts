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
import { assertIdempotencyKey, inventoryKindMatchesShopItem, isPrismaCode, serializable, shopPurchaseNote, shopTransactionWhere, type StudentIdentity } from "./service-shared";

export function slimeShopPurchaseSourceRef(
  studentId: string,
  idempotencyKey: string,
): string {
  return `${studentId}:${assertIdempotencyKey(idempotencyKey)}`;
}

async function replaySlimeShopPurchase(
  student: StudentIdentity,
  sourceRef: string,
  item: SlimeShopItem,
  chargeAmount: number,
): Promise<SlimeShopPurchaseResult | null> {
  const transaction = await db.transaction.findFirst({
    where: shopTransactionWhere(student.id, sourceRef),
  });
  if (!transaction) return null;
  if (transaction.note !== shopPurchaseNote(item.key)) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  /**
   * The note carries only the item key, so a replay with a different quantity
   * would otherwise report success while charging the original amount. Comparing
   * the charge keeps "same key means same request" true now that quantity is
   * part of a purchase.
   *
   * The stored amount is the only record of the original quantity, so a catalog
   * price change between the first call and a retry also trips this. That is the
   * accepted trade: the caller gets 409 and retries with a fresh key, and no
   * money moves incorrectly either way.
   */
  if (transaction.amount !== chargeAmount) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  const account = await db.studentAccount.findUnique({
    where: { id: transaction.accountId },
    select: { balance: true },
  });
  return {
    ownedItemKey: item.key,
    balance: account?.balance ?? transaction.balanceAfter,
    idempotent: true,
  };
}

/** Purchase one persistent slime-home item with the existing student wallet. */
export async function purchaseSlimeShopItem(
  student: StudentIdentity,
  itemKey: string,
  idempotencyKey: string,
  requestedQuantity = 1,
): Promise<SlimeShopPurchaseResult> {
  const item = getSlimeShopItem(itemKey);
  if (!item) throw new SlimeServiceError("unknown_item");
  if (!Number.isSafeInteger(item.price) || item.price <= 0) {
    throw new SlimeServiceError("unknown_item", "Invalid slime item price");
  }
  const isConsumable = item.category === "food";
  /**
   * Only consumables stack. Everything else is owned once per student and
   * equipped per slime, so a quantity above one would charge for an item the
   * student can never receive twice.
   */
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1) {
    throw new SlimeServiceError("invalid_body", "Invalid purchase quantity");
  }
  if (!isConsumable && requestedQuantity !== 1) {
    throw new SlimeServiceError("invalid_body", "Only consumables support quantity");
  }
  if (requestedQuantity > SLIME_MAX_PURCHASE_QUANTITY) {
    throw new SlimeServiceError("invalid_body", "Purchase quantity too large");
  }
  const quantity = isConsumable ? requestedQuantity : 1;
  const chargeAmount = item.price * quantity;

  const sourceRef = slimeShopPurchaseSourceRef(student.id, idempotencyKey);
  const replay = await replaySlimeShopPurchase(student, sourceRef, item, chargeAmount);
  if (replay) return replay;

  const account = await db.studentAccount.findUnique({
    where: { studentId: student.id },
    select: { id: true },
  });
  if (!account) throw new SlimeServiceError("account_not_found");

  const inventory = await db.studentCreatureItem?.findUnique?.({
    where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
    select: { id: true, quantity: true },
  });
  if (inventory && inventory.quantity > 0 && !isConsumable) {
    throw new SlimeServiceError("already_owned");
  }

  try {
    return await serializable(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: shopTransactionWhere(student.id, sourceRef),
      });
      if (existing) {
        if (existing.note !== shopPurchaseNote(item.key)) {
          throw new SlimeServiceError("idempotency_key_reused");
        }
        /**
         * Same guard as the pre-transaction replay. Two requests sharing a key
         * can both miss that check and race here, where only the loser sees
         * `existing`, so the quantity comparison has to live on this path too.
         */
        if (existing.amount !== chargeAmount) {
          throw new SlimeServiceError("idempotency_key_reused");
        }
        const currentAccount = await tx.studentAccount.findUnique({
          where: { id: existing.accountId },
          select: { balance: true },
        });
        return {
          ownedItemKey: item.key,
          balance: currentAccount?.balance ?? existing.balanceAfter,
          idempotent: true,
        };
      }

      const owned = await tx.studentCreatureItem?.findUnique?.({
        where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
        select: { id: true, quantity: true },
      });
      if (owned && owned.quantity > 0 && !isConsumable) {
        throw new SlimeServiceError("already_owned");
      }

      const guarded = await tx.studentAccount.updateMany({
        where: { id: account.id, studentId: student.id, balance: { gte: chargeAmount } },
        data: { balance: { decrement: chargeAmount } },
      });
      if (guarded.count !== 1) throw new SlimeServiceError("insufficient_funds");

      const updatedAccount = await tx.studentAccount.findUnique({
        where: { id: account.id },
        select: { balance: true },
      });
      if (!updatedAccount) throw new SlimeServiceError("account_not_found");

      const transaction = await tx.transaction.create({
        data: {
          accountId: account.id,
          type: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
          amount: chargeAmount,
          balanceAfter: updatedAccount.balance,
          note: shopPurchaseNote(item.key),
          sourceType: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
          sourceRef,
          performedById: student.id,
          performedByKind: "owner",
        },
      });

      if (owned) {
        await tx.studentCreatureItem.update({
          where: { id: owned.id },
          data: {
            quantity: isConsumable ? { increment: quantity } : 1,
            itemKind: `slime-${item.category}`,
            purchaseTransactionId: transaction.id,
          },
        });
      } else {
        await tx.studentCreatureItem.create({
          data: {
            studentId: student.id,
            classroomId: student.classroomId,
            itemKey: item.key,
            itemKind: `slime-${item.category}`,
            quantity,
            purchaseTransactionId: transaction.id,
          },
        });
      }

      return {
        ownedItemKey: item.key,
        balance: updatedAccount.balance,
        idempotent: false,
      };
    });
  } catch (error) {
    if (isPrismaCode(error, "P2002")) {
      const resolved = await replaySlimeShopPurchase(student, sourceRef, item, chargeAmount);
      if (resolved) return resolved;
      const owned = await db.studentCreatureItem?.findUnique?.({
        where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
        select: { id: true, quantity: true },
      });
      if (owned && owned.quantity > 0) throw new SlimeServiceError("already_owned");
      throw new SlimeServiceError("idempotency_key_reused");
    }
    throw error;
  }
}

export function slimeCookieUseSourceRef(
  studentId: string,
  idempotencyKey: string,
): string {
  return `${studentId}:${assertIdempotencyKey(idempotencyKey)}`;
}

type CookieGrowthSnapshot = ReturnType<typeof calculateSlimeGrowthSnapshot>;

function serializeCookieGrowth(snapshot: CookieGrowthSnapshot) {
  return {
    ...snapshot,
    growthLastSettledAt: snapshot.growthLastSettledAt.toISOString(),
    lastSettledAt: snapshot.lastSettledAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deserializeCookieGrowth(value: unknown): CookieGrowthSnapshot {
  if (!isRecord(value)) throw new SlimeServiceError("idempotency_key_reused");
  const growthLastSettledAt = new Date(String(value.growthLastSettledAt ?? value.lastSettledAt ?? ""));
  const lastSettledAt = new Date(String(value.lastSettledAt ?? value.growthLastSettledAt ?? ""));
  if (!Number.isFinite(growthLastSettledAt.getTime()) || !Number.isFinite(lastSettledAt.getTime())) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  const stageValue = Number(value.stage);
  const growthSecondsValue = Number(value.growthSeconds);
  const growthRemainderValue = Number(value.growthRemainderBps);
  const growthSpeedValue = Number(value.growthAppliedSpeedBps);
  const remainingSecondsValue = Number(value.remainingSeconds);
  const remainingMinutesValue = Number(value.remainingMinutes);
  if (
    !Number.isFinite(stageValue) ||
    !Number.isFinite(growthSecondsValue) ||
    !Number.isFinite(growthRemainderValue) ||
    !Number.isFinite(growthSpeedValue) ||
    !Number.isFinite(remainingSecondsValue) ||
    !Number.isFinite(remainingMinutesValue)
  ) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  const stage = normalizeSlimeGrowthStage(stageValue);
  const growthSeconds = Math.max(0, Math.trunc(growthSecondsValue));
  const growthRemainderBps = Math.max(0, Math.trunc(growthRemainderValue));
  const growthAppliedSpeedBps = Math.max(0, Math.trunc(growthSpeedValue));
  const nextStage = value.nextStage === null
    ? null
    : value.nextStage === 2 || value.nextStage === 3
      ? value.nextStage
      : stage < 3 ? ((stage + 1) as 2 | 3) : null;
  const remainingSeconds = Math.max(0, Math.trunc(remainingSecondsValue));
  const remainingMinutes = Math.max(0, Math.trunc(remainingMinutesValue));
  return {
    stage,
    growthSeconds,
    growthRemainderBps,
    growthLastSettledAt,
    growthAppliedSpeedBps,
    nextStage,
    remainingSeconds,
    remainingMinutes,
    growthProgressSeconds: growthSeconds,
    lastSettledAt,
    appliedSpeedBps: growthAppliedSpeedBps,
  };
}

function decodeCookieUse(
  use: { itemKey: string; effectSnapshot: unknown },
  color: SlimeColor,
): SlimeCookieConsumeResult {
  if (use.itemKey !== "slime-cookie" || !isRecord(use.effectSnapshot)) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  const effect = use.effectSnapshot;
  if (effect.kind !== "slime-cookie" || effect.color !== color) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  const remainingQuantity = Number(effect.remainingQuantity);
  if (!Number.isSafeInteger(remainingQuantity) || remainingQuantity < 0) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  return {
    itemKey: "slime-cookie",
    remainingQuantity,
    growth: deserializeCookieGrowth(effect.growth),
  };
}

async function replaySlimeCookieUse(
  student: StudentIdentity,
  sourceRef: string,
  color: SlimeColor,
): Promise<SlimeCookieConsumeResult | null> {
  const use = await db.creatureItemUse.findFirst({
    where: {
      studentId: student.id,
      sourceType: SLIME_COOKIE_USE_SOURCE_TYPE,
      sourceRef,
    },
    select: { itemKey: true, effectSnapshot: true },
  });
  if (!use) return null;
  return decodeCookieUse(use, color);
}

/** Consume one owned cookie and grant a fixed absolute growth bonus. */
export async function consumeSlimeCookie(
  student: StudentIdentity,
  itemKey: string,
  color: string,
  idempotencyKey: string,
): Promise<SlimeCookieConsumeResult> {
  const slime = getSlimeDefinition(color);
  if (itemKey !== "slime-cookie") throw new SlimeServiceError("unknown_item");
  if (!slime) throw new SlimeServiceError("unknown_slime");
  const sourceRef = slimeCookieUseSourceRef(student.id, idempotencyKey);
  const replay = await replaySlimeCookieUse(student, sourceRef, slime.color);
  if (replay) return replay;

  try {
    return await serializable(async (tx) => {
      const existing = await tx.creatureItemUse.findFirst({
        where: {
          studentId: student.id,
          sourceType: SLIME_COOKIE_USE_SOURCE_TYPE,
          sourceRef,
        },
        select: { itemKey: true, effectSnapshot: true },
      });
      if (existing) return decodeCookieUse(existing, slime.color);

      const ownedSlime = await tx.studentSlime.findUnique({
        where: { studentId_color: { studentId: student.id, color: slime.color } },
        select: slimeGrowthSelect,
      });
      if (!ownedSlime) throw new SlimeServiceError("not_owned");

      const inventory = await tx.studentCreatureItem.findUnique({
        where: { studentId_itemKey: { studentId: student.id, itemKey: "slime-cookie" } },
        select: { id: true, quantity: true, itemKind: true },
      });
      if (!inventory || inventory.itemKind !== "slime-food" || inventory.quantity < 1) {
        throw new SlimeServiceError("not_owned");
      }

      const now = new Date();
      const settled = settleSlimeGrowth(
        growthStateFromRow(ownedSlime as SlimeGrowthRow),
        now,
      );
      const nextState = addSlimeGrowthSeconds(settled, SLIME_COOKIE_GROWTH_SECONDS);
      const growth = calculateSlimeGrowthSnapshot(nextState, now);
      await tx.studentSlime.update({
        where: { id: ownedSlime.id },
        data: {
          growthStage: nextState.stage,
          growthSeconds: nextState.growthSeconds,
          growthRemainderBps: nextState.growthRemainderBps,
          growthLastSettledAt: nextState.growthLastSettledAt,
          growthAppliedSpeedBps: nextState.growthAppliedSpeedBps,
        },
      });

      const guarded = await tx.studentCreatureItem.updateMany({
        where: { id: inventory.id, quantity: { gte: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (guarded.count !== 1) throw new SlimeServiceError("not_owned");
      const updatedInventory = await tx.studentCreatureItem.findUnique({
        where: { id: inventory.id },
        select: { quantity: true },
      });
      if (!updatedInventory) throw new SlimeServiceError("not_owned");

      const effectSnapshot = {
        kind: "slime-cookie",
        color: slime.color,
        remainingQuantity: updatedInventory.quantity,
        growth: serializeCookieGrowth(growth),
      } as unknown as Prisma.InputJsonValue;
      await tx.creatureItemUse.create({
        data: {
          studentId: student.id,
          classroomId: student.classroomId,
          inventoryItemId: inventory.id,
          itemKey: "slime-cookie",
          itemKind: "slime-food",
          quantity: 1,
          effectSnapshot,
          progressBefore: settled.growthSeconds,
          progressAfter: nextState.growthSeconds,
          stageBefore: String(settled.stage),
          stageAfter: String(nextState.stage),
          idempotencyKey: sourceRef,
          sourceType: SLIME_COOKIE_USE_SOURCE_TYPE,
          sourceRef,
          usedAt: now,
        },
      });
      return {
        itemKey: "slime-cookie",
        remainingQuantity: updatedInventory.quantity,
        growth,
      };
    });
  } catch (error) {
    if (isPrismaCode(error, "P2002")) {
      const resolved = await replaySlimeCookieUse(student, sourceRef, slime.color);
      if (resolved) return resolved;
      throw new SlimeServiceError("idempotency_key_reused");
    }
    throw error;
  }
}
