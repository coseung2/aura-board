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
import { assertIdempotencyKey, inventoryKindMatchesShopItem, isPrismaCode, normalizeHiddenItemKeys, serializable, shopPurchaseNote, shopTransactionWhere, type StudentIdentity } from "./service-shared";

export async function refundSlime(
  student: StudentIdentity,
  color: string,
): Promise<SlimeRefundResult> {
  const slime = getSlimeDefinition(color);
  if (!slime) throw new SlimeServiceError("unknown_slime");

  return serializable(async (tx) => {
    const owned = await tx.studentSlime.findUnique({
      where: { studentId_color: { studentId: student.id, color: slime.color } },
      select: {
        id: true,
        isRepresentative: true,
        purchaseTransaction: {
          select: {
            id: true,
            amount: true,
            accountId: true,
            type: true,
            sourceType: true,
            account: { select: { studentId: true } },
          },
        },
      },
    });
    if (!owned) throw new SlimeServiceError("not_owned");
    if (
      !owned.purchaseTransaction ||
      owned.purchaseTransaction.amount <= 0 ||
      owned.purchaseTransaction.type !== SLIME_PURCHASE_SOURCE_TYPE ||
      owned.purchaseTransaction.sourceType !== SLIME_PURCHASE_SOURCE_TYPE ||
      owned.purchaseTransaction.account.studentId !== student.id
    ) {
      throw new SlimeServiceError("not_refundable");
    }

    const alreadyRefunded = await tx.transaction.findFirst({
      where: {
        sourceType: SLIME_REFUND_SOURCE_TYPE,
        sourceRef: owned.purchaseTransaction.id,
        account: { studentId: student.id },
      },
      select: { id: true },
    });
    if (alreadyRefunded) throw new SlimeServiceError("not_refundable");

    const account = await tx.studentAccount.update({
      where: { id: owned.purchaseTransaction.accountId },
      data: { balance: { increment: owned.purchaseTransaction.amount } },
      select: { balance: true },
    });
    await tx.transaction.create({
      data: {
        accountId: owned.purchaseTransaction.accountId,
        type: "refund",
        amount: owned.purchaseTransaction.amount,
        balanceAfter: account.balance,
        note: `slime-refund:${slime.color}`,
        sourceType: SLIME_REFUND_SOURCE_TYPE,
        sourceRef: owned.purchaseTransaction.id,
        performedById: student.id,
        performedByKind: "owner",
      },
    });
    await tx.studentSlime.delete({ where: { id: owned.id } });

    let representativeColor: SlimeColor | null = null;
    if (owned.isRepresentative) {
      const replacement = await tx.studentSlime.findFirst({
        where: { studentId: student.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, color: true },
      });
      if (replacement) {
        await tx.studentSlime.update({
          where: { id: replacement.id },
          data: { isRepresentative: true },
        });
        representativeColor = replacement.color as SlimeColor;
      }
    } else {
      const representative = await tx.studentSlime.findFirst({
        where: { studentId: student.id, isRepresentative: true },
        select: { color: true },
      });
      representativeColor = (representative?.color as SlimeColor | undefined) ?? null;
    }

    return { refundedColor: slime.color, balance: account.balance, representativeColor };
  }).catch((error: unknown) => {
    if (
      isPrismaCode(error, "P2002") ||
      isPrismaCode(error, "P2025") ||
      isPrismaCode(error, "P2034")
    ) {
      throw new SlimeServiceError("not_refundable");
    }
    throw error;
  });
}

export async function refundSlimeShopItem(
  student: StudentIdentity,
  itemKey: string,
): Promise<SlimeItemRefundResult> {
  const item = getSlimeShopItem(itemKey);
  if (!item) throw new SlimeServiceError("unknown_item");
  /**
   * Consumables cannot be refunded.
   *
   * Inventory tracks one running quantity and one `purchaseTransactionId`, which
   * the newest purchase overwrites. A refund would hand back that last
   * transaction's full amount while zeroing every unit on hand, so buying 99
   * cookies, eating 98, then refunding would make the eaten ones free. Fixing
   * that properly needs per-lot accounting; until then the money stays put.
   */
  if (item.category === "food") {
    throw new SlimeServiceError("not_refundable", "Consumables cannot be refunded");
  }

  return serializable(async (tx) => {
    const inventory = await tx.studentCreatureItem.findUnique({
      where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
      select: {
        id: true,
        quantity: true,
        itemKind: true,
        purchaseTransaction: {
          select: {
            id: true,
            amount: true,
            accountId: true,
            type: true,
            sourceType: true,
            account: { select: { studentId: true } },
          },
        },
      },
    });
    if (!inventory || inventory.quantity <= 0) throw new SlimeServiceError("not_owned");
    const purchase = inventory.purchaseTransaction ?? await tx.transaction.findFirst({
      where: {
        type: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
        sourceType: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
        note: shopPurchaseNote(item.key),
        account: { studentId: student.id },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        amount: true,
        accountId: true,
        type: true,
        sourceType: true,
        account: { select: { studentId: true } },
      },
    });
    if (
      !inventoryKindMatchesShopItem(item, inventory.itemKind) ||
      !purchase ||
      purchase.amount <= 0 ||
      purchase.type !== SLIME_ITEM_PURCHASE_SOURCE_TYPE ||
      purchase.sourceType !== SLIME_ITEM_PURCHASE_SOURCE_TYPE ||
      purchase.account.studentId !== student.id
    ) {
      throw new SlimeServiceError("not_refundable");
    }

    const alreadyRefunded = await tx.transaction.findFirst({
      where: {
        sourceType: SLIME_ITEM_REFUND_SOURCE_TYPE,
        sourceRef: purchase.id,
        account: { studentId: student.id },
      },
      select: { id: true },
    });
    if (alreadyRefunded) throw new SlimeServiceError("not_refundable");

    const account = await tx.studentAccount.update({
      where: { id: purchase.accountId },
      data: { balance: { increment: purchase.amount } },
      select: { balance: true },
    });
    await tx.transaction.create({
      data: {
        accountId: purchase.accountId,
        type: "refund",
        amount: purchase.amount,
        balanceAfter: account.balance,
        note: `slime-item-refund:${item.key}`,
        sourceType: SLIME_ITEM_REFUND_SOURCE_TYPE,
        sourceRef: purchase.id,
        performedById: student.id,
        performedByKind: "owner",
      },
    });
    await tx.studentCreatureItem.update({
      where: { id: inventory.id },
      data: {
        quantity: 0,
        isEquipped: false,
        purchaseTransactionId: purchase.id,
      },
    });
    const slimes = await tx.studentSlime.findMany({
      where: { studentId: student.id, equippedItemKeys: { has: item.key } },
      select: { id: true, equippedItemKeys: true, hiddenItemKeys: true },
    });
    for (const ownedSlime of slimes) {
      const equippedItemKeys = ownedSlime.equippedItemKeys.filter((key) => key !== item.key);
      await tx.studentSlime.update({
        where: { id: ownedSlime.id },
        data: {
          equippedItemKeys,
          hiddenItemKeys: normalizeHiddenItemKeys(ownedSlime.hiddenItemKeys, equippedItemKeys),
        },
      });
    }

    return { refundedItemKey: item.key, balance: account.balance };
  }).catch((error: unknown) => {
    if (
      isPrismaCode(error, "P2002") ||
      isPrismaCode(error, "P2025") ||
      isPrismaCode(error, "P2034")
    ) {
      throw new SlimeServiceError("not_refundable");
    }
    throw error;
  });
}

/**
 * Toggle one owned slime-home item without touching the purchase ledger.
 * True scene backgrounds compose with floors and accessories. Floors share one
 * semantic slot even though legacy items span background and ride categories.
 * The serializable transaction keeps resets and updates atomic.
 */
export async function equipSlimeShopItem(
  student: StudentIdentity,
  slimeColor: string,
  itemKey: string,
  isEquipped: boolean,
  idempotencyKey: string,
): Promise<SlimeShopEquipResult> {
  const slime = getSlimeDefinition(slimeColor);
  const normalizedKey = typeof itemKey === "string" ? itemKey.trim() : "";
  const item = getSlimeShopItem(normalizedKey);
  const itemSlot = item ? slimeVisualItemSlot(item) : null;
  if (!slime || !item || !itemSlot || typeof isEquipped !== "boolean") {
    throw new SlimeServiceError("invalid_body");
  }
  // Equip requests are replay-safe state transitions. We still validate the
  // key so malformed callers cannot bypass the ownership/type checks below.
  assertIdempotencyKey(idempotencyKey);

  return serializable(async (tx) => {
    const ownedSlime = await tx.studentSlime.findUnique({
      where: { studentId_color: { studentId: student.id, color: slime.color } },
      select: { id: true, equippedItemKeys: true, hiddenItemKeys: true },
    });
    if (!ownedSlime) throw new SlimeServiceError("not_owned");
    const inventory = await tx.studentCreatureItem.findUnique({
      where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
    });
    if (
      !inventory ||
      !inventoryKindMatchesShopItem(item, inventory.itemKind) ||
      inventory.quantity < 1
    ) {
      throw new SlimeServiceError("not_owned");
    }

    const slimeRowsBefore = await tx.studentSlime.findMany({
      where: { studentId: student.id },
      select: { id: true, color: true, isRepresentative: true, equippedItemKeys: true, hiddenItemKeys: true },
      orderBy: { createdAt: "asc" },
    });
    let nextKeys = normalizeEquippedSlimeItemKeys(
      ownedSlime.equippedItemKeys.filter((key) => key !== item.key),
    );
    if (isEquipped) {
      nextKeys = nextKeys.filter((key) => {
        const candidate = getSlimeShopItem(key);
        return !candidate || slimeVisualItemSlot(candidate) !== itemSlot;
      });
      nextKeys.push(item.key);
      nextKeys = normalizeEquippedSlimeItemKeys(nextKeys);
    }

    const nextKeysBySlimeId = new Map(
      slimeRowsBefore.map((row) => [
        row.id,
        row.color === slime.color
          ? nextKeys
          : isEquipped
            ? normalizeEquippedSlimeItemKeys(row.equippedItemKeys.filter((key) => key !== item.key))
            : normalizeEquippedSlimeItemKeys(row.equippedItemKeys),
      ]),
    );
    const nextHiddenKeysBySlimeId = new Map(
      slimeRowsBefore.map((row) => [
        row.id,
        normalizeHiddenItemKeys(row.hiddenItemKeys, nextKeysBySlimeId.get(row.id) ?? row.equippedItemKeys),
      ]),
    );
    const changedRows = slimeRowsBefore.filter((row) => {
      const rowNextKeys = nextKeysBySlimeId.get(row.id) ?? row.equippedItemKeys;
      const rowNextHiddenKeys = nextHiddenKeysBySlimeId.get(row.id) ?? [];
      const currentHiddenKeys = row.hiddenItemKeys ?? [];
      return rowNextKeys.length !== row.equippedItemKeys.length ||
        rowNextKeys.some((key, index) => key !== row.equippedItemKeys[index]) ||
        rowNextHiddenKeys.length !== currentHiddenKeys.length ||
        rowNextHiddenKeys.some((key, index) => key !== currentHiddenKeys[index]);
    });
    await Promise.all(
      changedRows.map((row) =>
        tx.studentSlime.update({
          where: { id: row.id },
          data: {
            equippedItemKeys: nextKeysBySlimeId.get(row.id) ?? row.equippedItemKeys,
            hiddenItemKeys: nextHiddenKeysBySlimeId.get(row.id) ?? [],
          },
        }),
      ),
    );

    const equippedItemsByColor = Object.fromEntries(
      slimeRowsBefore.map((row) => [row.color, nextKeysBySlimeId.get(row.id) ?? row.equippedItemKeys]),
    ) as Partial<Record<SlimeColor, string[]>>;
    const equippedItemKeys = Array.from(new Set(Object.values(equippedItemsByColor).flatMap((keys) => keys ?? [])));
    const hiddenItemsByColor = Object.fromEntries(
      slimeRowsBefore.map((row) => [
        row.color,
        nextHiddenKeysBySlimeId.get(row.id) ?? [],
      ]),
    ) as Partial<Record<SlimeColor, string[]>>;
    const hiddenItemKeys = Array.from(
      new Set(Object.values(hiddenItemsByColor).flatMap((keys) => keys ?? [])),
    );
    const slotItemKeys = SLIME_SHOP_CATALOG
      .filter((candidate) => slimeVisualItemSlot(candidate) === itemSlot)
      .map((candidate) => candidate.key);
    const equippedSlotItemKeys = equippedItemKeys.filter((key) => {
      const candidate = getSlimeShopItem(key);
      return candidate ? slimeVisualItemSlot(candidate) === itemSlot : false;
    });
    await tx.studentCreatureItem.updateMany({
      where: { studentId: student.id, itemKey: { in: slotItemKeys } },
      data: { isEquipped: false },
    });
    if (equippedSlotItemKeys.length > 0) {
      await tx.studentCreatureItem.updateMany({
        where: { studentId: student.id, itemKey: { in: equippedSlotItemKeys } },
        data: { isEquipped: true },
      });
    }
    const equippedFloorByColor = Object.fromEntries(
      slimeRowsBefore.map((row) => [
        row.color,
        getEquippedSlimeFloor(equippedItemsByColor[row.color as SlimeColor] ?? []),
      ]),
    ) as Partial<Record<SlimeColor, SlimeFloor>>;
    const representativeColor = slimeRowsBefore.find((row) => row.isRepresentative)?.color as SlimeColor | undefined;
    return {
      slimeColor: slime.color,
      itemKey: item.key,
      isEquipped,
      equippedItemKeys,
      equippedItemsByColor,
      hiddenItemKeys,
      hiddenItemsByColor,
      equippedFloorByColor,
      equippedFloor: representativeColor
        ? equippedFloorByColor[representativeColor] ?? "none"
        : "none",
      idempotent: changedRows.length === 0,
    };
  });
}

/** Keep an equipped item active while controlling only its visual visibility. */
export async function setSlimeShopItemHidden(
  student: StudentIdentity,
  slimeColor: string,
  itemKey: string,
  isHidden: boolean,
): Promise<SlimeShopVisibilityResult> {
  const slime = getSlimeDefinition(slimeColor);
  const normalizedKey = typeof itemKey === "string" ? itemKey.trim() : "";
  const item = getSlimeShopItem(normalizedKey);
  if (!slime || !item || !slimeVisualItemSlot(item) || typeof isHidden !== "boolean") {
    throw new SlimeServiceError("invalid_body");
  }

  return serializable(async (tx) => {
    const [ownedSlime, inventory, slimeRows] = await Promise.all([
      tx.studentSlime.findUnique({
        where: { studentId_color: { studentId: student.id, color: slime.color } },
        select: { id: true, equippedItemKeys: true, hiddenItemKeys: true },
      }),
      tx.studentCreatureItem.findUnique({
        where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
      }),
      tx.studentSlime.findMany({
        where: { studentId: student.id },
        select: { id: true, color: true, equippedItemKeys: true, hiddenItemKeys: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    if (!ownedSlime) throw new SlimeServiceError("not_owned");
    if (
      !inventory ||
      !inventoryKindMatchesShopItem(item, inventory.itemKind) ||
      inventory.quantity < 1
    ) {
      throw new SlimeServiceError("not_owned");
    }
    if (isHidden && !ownedSlime.equippedItemKeys.includes(item.key)) {
      throw new SlimeServiceError("invalid_body");
    }

    const previousHidden = normalizeHiddenItemKeys(
      ownedSlime.hiddenItemKeys,
      ownedSlime.equippedItemKeys,
    );
    const nextHiddenItemKeys = isHidden
      ? Array.from(new Set([...previousHidden, item.key]))
      : previousHidden.filter((key) => key !== item.key);
    const idempotent = nextHiddenItemKeys.length === previousHidden.length &&
      nextHiddenItemKeys.every((key, index) => key === previousHidden[index]);
    if (!idempotent || (ownedSlime.hiddenItemKeys?.length ?? 0) !== previousHidden.length) {
      await tx.studentSlime.update({
        where: { id: ownedSlime.id },
        data: { hiddenItemKeys: nextHiddenItemKeys },
      });
    }

    const equippedItemsByColor = Object.fromEntries(
      slimeRows.map((row) => [row.color, normalizeEquippedSlimeItemKeys(row.equippedItemKeys)]),
    ) as Partial<Record<SlimeColor, string[]>>;
    const hiddenItemsByColor = Object.fromEntries(
      slimeRows.map((row) => [
        row.color,
        row.id === ownedSlime.id
          ? nextHiddenItemKeys
          : normalizeHiddenItemKeys(row.hiddenItemKeys, row.equippedItemKeys),
      ]),
    ) as Partial<Record<SlimeColor, string[]>>;
    const hiddenItemKeys = Array.from(
      new Set(Object.values(hiddenItemsByColor).flatMap((keys) => keys ?? [])),
    );
    const equippedItemKeys = Array.from(
      new Set(Object.values(equippedItemsByColor).flatMap((keys) => keys ?? [])),
    );
    return {
      slimeColor: slime.color,
      itemKey: item.key,
      isHidden,
      equippedItemKeys,
      equippedItemsByColor,
      hiddenItemKeys,
      hiddenItemsByColor,
      idempotent,
    };
  });
}
