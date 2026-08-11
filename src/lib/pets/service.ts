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

export {
  SLIME_ITEM_PURCHASE_SOURCE_TYPE,
  SLIME_ITEM_REFUND_SOURCE_TYPE,
  SLIME_COOKIE_USE_SOURCE_TYPE,
  SLIME_PURCHASE_SOURCE_TYPE,
  SLIME_REFUND_SOURCE_TYPE,
  SlimeServiceError,
  isSlimeServiceError,
} from "./service-contract";
export type {
  SlimeEquipResult,
  SlimeHome,
  SlimeItemRefundResult,
  SlimePurchaseResult,
  SlimeRefundResult,
  SlimeServiceErrorCode,
  SlimeShopEquipResult,
  SlimeShopPurchaseResult,
  SlimeShopVisibilityResult,
  SlimeCookieConsumeResult,
} from "./service-contract";

import { assertIdempotencyKey, isPrismaCode, normalizeHiddenItemKeys, purchaseNote, serializable, slimePurchaseSourceRef, transactionWhere, type StudentIdentity } from "./service-shared";

async function walkingTitleForStudent(studentId: string) {
  // Isolated service fixtures mock only the delegates they exercise, so treat a
  // missing raw-query capability as "no title yet" instead of failing the home.
  if (typeof db.$queryRaw !== "function") return null;
  const [stats] = await db.$queryRaw<WalkingTitleStats[]>(Prisma.sql`
    WITH stats AS MATERIALIZED (
      SELECT "day", "steps"
      FROM "StudentWalkingDailyStat"
      WHERE "studentId" = ${studentId}
    ), daily AS (
      SELECT MAX("steps")::bigint AS "maxDailySteps"
      FROM stats
    ), weekly AS (
      SELECT MAX("weeklySteps")::bigint AS "maxWeeklySteps"
      FROM (
        SELECT DATE_TRUNC('week', "day") AS "weekStart", SUM("steps")::bigint AS "weeklySteps"
        FROM stats
        GROUP BY DATE_TRUNC('week', "day")
      ) totals
    ), monthly AS (
      SELECT MAX("monthlySteps")::bigint AS "maxMonthlySteps"
      FROM (
        SELECT DATE_TRUNC('month', "day") AS "monthStart", SUM("steps")::bigint AS "monthlySteps"
        FROM stats
        GROUP BY DATE_TRUNC('month', "day")
      ) totals
    )
    SELECT
      COALESCE(daily."maxDailySteps", 0)::bigint AS "maxDailySteps",
      COALESCE(weekly."maxWeeklySteps", 0)::bigint AS "maxWeeklySteps",
      COALESCE(monthly."maxMonthlySteps", 0)::bigint AS "maxMonthlySteps"
    FROM daily CROSS JOIN weekly CROSS JOIN monthly
  `);
  return walkingTitleForStats(stats ?? {
    maxDailySteps: 0,
    maxWeeklySteps: 0,
    maxMonthlySteps: 0,
  });
}

async function replayPurchase(
  student: StudentIdentity,
  sourceRef: string,
  color: SlimeColor,
): Promise<SlimePurchaseResult | null> {
  const transaction = await db.transaction.findFirst({
    where: transactionWhere(student.id, sourceRef),
    include: { slimePurchase: true },
  });
  if (!transaction) return null;
  if (
    transaction.note !== purchaseNote(color) ||
    transaction.slimePurchase?.color !== color
  ) {
    throw new SlimeServiceError("idempotency_key_reused");
  }
  const account = await db.studentAccount.findUnique({
    where: { id: transaction.accountId },
    select: { balance: true },
  });
  return {
    ownedColor: color,
    balance: account?.balance ?? transaction.balanceAfter,
    idempotent: true,
  };
}

export async function getSlimeHome(student: StudentIdentity): Promise<SlimeHome> {
  const [account, currency, owned, ownedItems, walkingTitle, claimedTitleRows] = await Promise.all([
    db.studentAccount.findUnique({
      where: { studentId: student.id },
      select: { balance: true },
    }),
    cachedClassroomCurrency(student.classroomId, () =>
      db.classroomCurrency.findUnique({
        where: { classroomId: student.classroomId },
        select: { unitLabel: true },
      }),
    ),
    db.studentSlime.findMany({
      // Slime ownership follows the student if they move classrooms. The
      // classroomId remains an audit snapshot of where it was purchased.
      where: { studentId: student.id },
      select: {
        ...slimeGrowthSelect,
        isRepresentative: true,
        equippedItemKeys: true,
        hiddenItemKeys: true,
        equippedTitleKey: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    // The inventory delegate was added with the creature system. Keeping the
    // runtime guard makes older isolated service tests (which mock only slime
    // ownership) continue to exercise the original home response.
    db.studentCreatureItem?.findMany?.({
      where: { studentId: student.id, quantity: { gt: 0 } },
      select: { itemKey: true, quantity: true, isEquipped: true },
      orderBy: { createdAt: "asc" },
    }) ?? Promise.resolve([] as { itemKey: string; quantity?: number; isEquipped?: boolean }[]),
    walkingTitleForStudent(student.id),
    // The title delegate arrived with claimable titles; older isolated fixtures
    // mock only slime ownership and still expect a usable home response.
    db.studentTitle?.findMany?.({
      where: { studentId: student.id },
      select: { titleKey: true },
      orderBy: { claimedAt: "asc" },
    }) ?? Promise.resolve([] as { titleKey: string }[]),
  ]);
  if (!account) throw new SlimeServiceError("account_not_found");
  const growthRows = Array.isArray(owned) ? owned : [];
  const ownedSet = new Set(owned.map((row) => row.color));
  const equippedSet = new Set(
    owned.filter((row) => row.isEquipped !== false).map((row) => row.color),
  );
  const ownedItemQuantities: Record<string, number> = {};
  for (const inventoryItem of Array.isArray(ownedItems) ? ownedItems : []) {
    if (!getSlimeShopItem(inventoryItem.itemKey)) continue;
    // Isolated service fixtures predate the quantity field; those rows still
    // represent one owned item because the query filters out zero quantities.
    const quantity = Number.isFinite(inventoryItem.quantity)
      ? Math.max(0, Math.trunc(inventoryItem.quantity as number))
      : 1;
    if (quantity > 0) {
      ownedItemQuantities[inventoryItem.itemKey] =
        (ownedItemQuantities[inventoryItem.itemKey] ?? 0) + quantity;
    }
  }
  const ownedItemKeys = Object.keys(ownedItemQuantities);
  const equippedItemsByColor = Object.fromEntries(
    owned.map((slime) => [
      slime.color,
      normalizeEquippedSlimeItemKeys(slime.equippedItemKeys ?? []),
    ]),
  ) as Partial<Record<SlimeColor, string[]>>;
  const equippedItemKeys = Array.from(
    new Set(Object.values(equippedItemsByColor).flatMap((keys) => keys ?? [])),
  );
  const hiddenItemsByColor = Object.fromEntries(
    owned.map((slime) => {
      const color = slime.color as SlimeColor;
      return [color, normalizeHiddenItemKeys(slime.hiddenItemKeys, equippedItemsByColor[color] ?? [])];
    }),
  ) as Partial<Record<SlimeColor, string[]>>;
  const hiddenItemKeys = Array.from(
    new Set(Object.values(hiddenItemsByColor).flatMap((keys) => keys ?? [])),
  );
  const equippedFloorByColor = Object.fromEntries(
    owned.map((slime) => [
      slime.color,
      getEquippedSlimeFloor(equippedItemsByColor[slime.color as SlimeColor] ?? []),
    ]),
  ) as Partial<Record<SlimeColor, SlimeFloor>>;
  const equippedTitleByColor = Object.fromEntries(
    owned
      .filter((slime) => slime.equippedTitleKey)
      .map((slime) => [slime.color, slime.equippedTitleKey as string]),
  ) as Partial<Record<SlimeColor, string>>;
  const claimedTitles = claimedTitleRows.flatMap((row) => {
    const definition = getTitleDefinition(row.titleKey);
    if (!definition) return [];
    return [{
      key: definition.key,
      label: definition.label,
      imagePath: definition.imagePath,
      effectKey: definition.effectKey,
      buffBps: definition.buffBps,
    }];
  });
  const representativeColor =
    (owned.find((row) => row.isRepresentative)?.color as SlimeColor | undefined) ?? null;
  const equippedColors = SLIME_CATALOG.map((slime) => slime.color).filter((color) => equippedSet.has(color));
  const ownedColors = SLIME_CATALOG.map((slime) => slime.color).filter((color) => ownedSet.has(color));
  const now = new Date();
  const hasPersistedGrowth = growthRows.some(
    (row) => row.growthLastSettledAt != null,
  );
  const growthSource = hasPersistedGrowth
    ? growthRows
    : owned.map((row) => ({
        id: `legacy-${row.color}`,
        color: row.color,
        isEquipped: row.isEquipped !== false,
        growthStage: 1,
        growthSeconds: 0,
        growthRemainderBps: 0,
        growthLastSettledAt: now,
        growthAppliedSpeedBps: 0,
      }));
  const growthByColor = growthSnapshotByColor(
    growthSource as SlimeGrowthRow[],
    now,
  );
  const growthStages = Object.fromEntries(
    Object.entries(growthByColor).map(([color, growth]) => [color, growth?.stage ?? 1]),
  ) as Partial<Record<SlimeColor, number>>;
  const effects = calculateCatalogSlimeEffects(
    ownedColors,
    equippedItemKeys,
    undefined,
    growthStages,
  );
  return {
    balance: account.balance,
    currency: { unitLabel: currency?.unitLabel?.trim() || "원" },
    ownedColors,
    equippedColors,
    representativeColor,
    catalog: SLIME_CATALOG,
    ownedItemKeys,
    ownedItemQuantities,
    equippedItemKeys,
    equippedItemsByColor,
    hiddenItemKeys,
    hiddenItemsByColor,
    equippedFloorByColor,
    equippedFloor: representativeColor
      ? equippedFloorByColor[representativeColor] ?? "none"
      : "none",
    shopCatalog: SLIME_SHOP_CATALOG,
    effects,
    growthSpeedBps: effects.totals.growth_speed,
    growthByColor,
    growth: growthByColor,
    walkingTitle,
    claimedTitles,
    equippedTitleByColor,
  };
}

export async function setRepresentativeSlime(
  student: StudentIdentity,
  color: string,
): Promise<{ representativeColor: SlimeColor }> {
  const slime = getSlimeDefinition(color);
  if (!slime) throw new SlimeServiceError("unknown_slime");

  return serializable(async (tx) => {
    const owned = await tx.studentSlime.findUnique({
      where: { studentId_color: { studentId: student.id, color: slime.color } },
      select: { id: true },
    });
    if (!owned) throw new SlimeServiceError("not_owned");

    await tx.studentSlime.updateMany({
      where: { studentId: student.id, isRepresentative: true },
      data: { isRepresentative: false },
    });
    await tx.studentSlime.update({
      where: { id: owned.id },
      data: { isRepresentative: true },
    });
    return { representativeColor: slime.color };
  });
}

/**
 * Toggle a student's owned slime.  Every row is settled under its persisted
 * rate first; only then is the aggregate equipped growth speed applied.  This
 * keeps an equip/unequip request from valuing earlier elapsed time at the new
 * rate and makes the state transition atomic under concurrent clicks.
 */
export async function equipSlime(
  student: StudentIdentity,
  color: string,
  isEquipped: boolean,
): Promise<SlimeEquipResult> {
  const slime = getSlimeDefinition(color);
  if (!slime || typeof isEquipped !== "boolean") {
    throw new SlimeServiceError("invalid_body");
  }

  return serializable(async (tx) => {
    const rowsResult = await tx.studentSlime.findMany({
      where: { studentId: student.id },
      select: slimeGrowthSelect,
      orderBy: { createdAt: "asc" },
    });
    const rows = (Array.isArray(rowsResult) ? rowsResult : []) as unknown as SlimeGrowthRow[];
    const target = rows.find((row) => row.color === slime.color);
    if (!target) throw new SlimeServiceError("not_owned");

    const now = new Date();
    const settledRows = rows.map((row) => ({
      row,
      settled: settleSlimeGrowth(growthStateFromRow(row), now),
      nextIsEquipped: row.color === slime.color ? isEquipped : row.isEquipped !== false,
    }));
    const nextEquippedColors = SLIME_CATALOG.map((candidate) => candidate.color).filter(
      (candidate) =>
        settledRows.some(
          ({ row, nextIsEquipped }) =>
            row.color === candidate && nextIsEquipped,
        ),
    );
    const ownedColors = SLIME_CATALOG.map((candidate) => candidate.color).filter((candidate) =>
      settledRows.some(({ row }) => row.color === candidate),
    );
    const growthStages = Object.fromEntries(
      settledRows.map(({ row, settled }) => [row.color, settled.stage]),
    ) as Partial<Record<SlimeColor, number>>;
    const effects = growthEffectsForColors(ownedColors, growthStages);
    const growthSpeedBps = effects.totals.growth_speed;
    const updatedRows: SlimeGrowthRow[] = [];

    for (const { row, settled, nextIsEquipped } of settledRows) {
      const nextState = settleSlimeGrowthWithSpeed(
        settled,
        growthSpeedBps,
        now,
      );
      await tx.studentSlime.update({
        where: { id: row.id },
        data: {
          isEquipped: nextIsEquipped,
          growthStage: nextState.stage,
          growthSeconds: nextState.growthSeconds,
          growthRemainderBps: nextState.growthRemainderBps,
          growthLastSettledAt: nextState.growthLastSettledAt,
          growthAppliedSpeedBps: nextState.growthAppliedSpeedBps,
        },
      });
      updatedRows.push({
        ...row,
        isEquipped: nextIsEquipped,
        growthStage: nextState.stage,
        growthSeconds: nextState.growthSeconds,
        growthRemainderBps: nextState.growthRemainderBps,
        growthLastSettledAt: nextState.growthLastSettledAt,
        growthAppliedSpeedBps: nextState.growthAppliedSpeedBps,
      });
    }

    const growthByColor = growthSnapshotByColor(updatedRows, now);
    return {
      slimeColor: slime.color,
      isEquipped,
      equippedColors: nextEquippedColors,
      growthSpeedBps,
      growthByColor,
      growth: growthByColor,
      effects,
    };
  });
}

/** Descriptive alias for callers that prefer a setter-shaped name. */
export const setSlimeEquipped = equipSlime;

export async function purchaseSlime(
  student: StudentIdentity,
  color: string,
  idempotencyKey: string,
  retryRepresentativeConflict = true,
): Promise<SlimePurchaseResult> {
  const slime = getSlimeDefinition(color);
  if (!slime) throw new SlimeServiceError("unknown_slime");
  if (!Number.isSafeInteger(slime.price) || slime.price <= 0) {
    throw new SlimeServiceError("unknown_slime", "Invalid slime price");
  }
  const sourceRef = slimePurchaseSourceRef(student.id, idempotencyKey);
  const replay = await replayPurchase(student, sourceRef, slime.color);
  if (replay) return replay;

  const account = await db.studentAccount.findUnique({
    where: { studentId: student.id },
    select: { id: true },
  });
  if (!account) throw new SlimeServiceError("account_not_found");
  const alreadyOwned = await db.studentSlime.findUnique({
    where: { studentId_color: { studentId: student.id, color: slime.color } },
    select: { id: true },
  });
  if (alreadyOwned) throw new SlimeServiceError("already_owned");

  const purchasedAt = new Date();

  try {
    return await serializable(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: transactionWhere(student.id, sourceRef),
        include: { slimePurchase: true },
      });
      if (existing) {
        if (
          existing.note !== purchaseNote(slime.color) ||
          existing.slimePurchase?.color !== slime.color
        ) {
          throw new SlimeServiceError("idempotency_key_reused");
        }
        const currentAccount = await tx.studentAccount.findUnique({
          where: { id: existing.accountId },
          select: { balance: true },
        });
        return {
          ownedColor: slime.color,
          balance: currentAccount?.balance ?? existing.balanceAfter,
          idempotent: true,
        };
      }

      const owned = await tx.studentSlime.findUnique({
        where: { studentId_color: { studentId: student.id, color: slime.color } },
        select: { id: true },
      });
      if (owned) throw new SlimeServiceError("already_owned");

      // Read growth rows inside the same serializable transaction as the
      // purchase.  Older isolated service mocks may not expose findMany or
      // update; in that case the new row still receives a correct standalone
      // rate and no existing row can be mutated accidentally.
      const txSlimes = tx.studentSlime as unknown as {
        findMany?: (args: unknown) => Promise<unknown[]>;
        update?: (args: unknown) => Promise<unknown>;
      };
      const growthRowsResult =
        typeof txSlimes.findMany === "function"
          ? await txSlimes.findMany({
              where: { studentId: student.id },
              select: slimeGrowthSelect,
              orderBy: { createdAt: "asc" },
            })
          : [];
      const existingGrowthRows = (Array.isArray(growthRowsResult) ? growthRowsResult : []) as SlimeGrowthRow[];
      const initialOwnedColors = SLIME_CATALOG.map((candidate) => candidate.color).filter(
        (candidate) =>
          candidate === slime.color ||
          existingGrowthRows.some(
            (row) => row.color === candidate,
          ),
      );
      const initialGrowthStages = Object.fromEntries([
        ...existingGrowthRows.map((row) => [row.color, row.growthStage]),
        [slime.color, 1],
      ]) as Partial<Record<SlimeColor, number>>;
      const initialGrowthSpeedBps = growthEffectsForColors(
        initialOwnedColors,
        initialGrowthStages,
      ).totals.growth_speed;

      const guarded = await tx.studentAccount.updateMany({
        where: { id: account.id, studentId: student.id, balance: { gte: slime.price } },
        data: { balance: { decrement: slime.price } },
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
          type: SLIME_PURCHASE_SOURCE_TYPE,
          amount: slime.price,
          balanceAfter: updatedAccount.balance,
          note: purchaseNote(slime.color),
          sourceType: SLIME_PURCHASE_SOURCE_TYPE,
          sourceRef,
          performedById: student.id,
          performedByKind: "owner",
        },
      });
      const existingRepresentative = await tx.studentSlime.findFirst({
        where: { studentId: student.id, isRepresentative: true },
        select: { id: true },
      });
      await tx.studentSlime.create({
        data: {
          studentId: student.id,
          classroomId: student.classroomId,
          color: slime.color,
          isRepresentative: !existingRepresentative,
          growthStage: 1,
          growthSeconds: 0,
          growthRemainderBps: 0,
          growthLastSettledAt: purchasedAt,
          growthAppliedSpeedBps: initialGrowthSpeedBps,
          purchaseTransactionId: transaction.id,
        },
      });

      // Buying an equipped growth slime changes the rate for every equipped
      // timer.  Settle each existing row under its persisted old rate, then
      // apply the new aggregate rate before this transaction commits.
      if (existingGrowthRows.length > 0 && typeof txSlimes.update === "function") {
        for (const row of existingGrowthRows) {
          const settled = settleSlimeGrowth(growthStateFromRow(row, purchasedAt), purchasedAt);
          const nextState = settleSlimeGrowthWithSpeed(
            settled,
            initialGrowthSpeedBps,
            purchasedAt,
          );
          await txSlimes.update({
            where: { id: row.id },
            data: {
              growthStage: nextState.stage,
              growthSeconds: nextState.growthSeconds,
              growthRemainderBps: nextState.growthRemainderBps,
              growthLastSettledAt: nextState.growthLastSettledAt,
              growthAppliedSpeedBps: nextState.growthAppliedSpeedBps,
            },
          });
        }
      }
      return {
        ownedColor: slime.color,
        balance: updatedAccount.balance,
        idempotent: false,
      };
    });
  } catch (error) {
    if (isPrismaCode(error, "P2002")) {
      const resolved = await replayPurchase(student, sourceRef, slime.color);
      if (resolved) return resolved;
      const owned = await db.studentSlime.findUnique({
        where: { studentId_color: { studentId: student.id, color: slime.color } },
        select: { id: true },
      });
      if (owned) throw new SlimeServiceError("already_owned");
      if (retryRepresentativeConflict) {
        return purchaseSlime(student, color, idempotencyKey, false);
      }
      throw new SlimeServiceError("idempotency_key_reused");
    }
    throw error;
  }
}


export { slimePurchaseSourceRef } from "./service-shared";
export { slimeShopPurchaseSourceRef, purchaseSlimeShopItem, slimeCookieUseSourceRef, consumeSlimeCookie } from "./service-shop";
export { refundSlime, refundSlimeShopItem, equipSlimeShopItem, setSlimeShopItemHidden } from "./service-refunds";
