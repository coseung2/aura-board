import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  getSlimeDefinition,
  getSlimeShopItem,
  SLIME_CATALOG,
  SLIME_SHOP_CATALOG,
} from "./catalog";
import {
  calculateSlimeGrowthSnapshot,
  normalizeSlimeGrowthStage,
  settleSlimeGrowth,
  settleSlimeGrowthWithSpeed,
  type SlimeGrowthSnapshot,
  type SlimeGrowthState,
} from "./growth";
import { calculateCatalogSlimeEffects } from "./math";
import type { SlimeColor, SlimeShopItem } from "./types";

export const SLIME_PURCHASE_SOURCE_TYPE = "slime_purchase" as const;
export const SLIME_ITEM_PURCHASE_SOURCE_TYPE = "slime_item_purchase" as const;
export const SLIME_REFUND_SOURCE_TYPE = "slime_refund" as const;
export const SLIME_ITEM_REFUND_SOURCE_TYPE = "slime_item_refund" as const;

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

export function isSlimeServiceError(error: unknown): error is SlimeServiceError {
  return error instanceof SlimeServiceError;
}

type StudentIdentity = { id: string; classroomId: string };

export type SlimeHome = {
  balance: number;
  currency: { unitLabel: string };
  ownedColors: SlimeColor[];
  equippedColors: SlimeColor[];
  representativeColor: SlimeColor | null;
  catalog: typeof SLIME_CATALOG;
  ownedItemKeys: string[];
  equippedItemKeys: string[];
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>;
  shopCatalog: typeof SLIME_SHOP_CATALOG;
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
  growthSpeedBps: number;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowthSnapshot>>;
  growth: Partial<Record<SlimeColor, SlimeGrowthSnapshot>>;
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

function assertIdempotencyKey(key: string): string {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed || trimmed.length > 200) {
    throw new SlimeServiceError("invalid_body", "Invalid idempotency key");
  }
  return trimmed;
}

export function slimePurchaseSourceRef(studentId: string, idempotencyKey: string): string {
  return `${studentId}:${assertIdempotencyKey(idempotencyKey)}`;
}

function purchaseNote(color: SlimeColor): string {
  return `slime-purchase:${color}`;
}

function shopPurchaseNote(itemKey: string): string {
  return `slime-item-purchase:${itemKey}`;
}

function transactionWhere(studentId: string, sourceRef: string) {
  return {
    sourceType: SLIME_PURCHASE_SOURCE_TYPE,
    sourceRef,
    account: { studentId },
  };
}

function shopTransactionWhere(studentId: string, sourceRef: string) {
  return {
    sourceType: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
    sourceRef,
    account: { studentId },
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
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

type SlimeGrowthRow = {
  id: string;
  color: string;
  isEquipped: boolean;
  growthStage: number;
  growthSeconds: number;
  growthRemainderBps: number;
  growthLastSettledAt: Date;
  growthAppliedSpeedBps: number;
};

const slimeGrowthSelect = {
  id: true,
  color: true,
  isEquipped: true,
  growthStage: true,
  growthSeconds: true,
  growthRemainderBps: true,
  growthLastSettledAt: true,
  growthAppliedSpeedBps: true,
} as const;

function growthStateFromRow(row: SlimeGrowthRow, fallbackNow = new Date()): SlimeGrowthState {
  return {
    stage: normalizeSlimeGrowthStage(row.growthStage),
    growthSeconds: row.growthSeconds,
    growthRemainderBps: row.growthRemainderBps,
    growthLastSettledAt:
      row.growthLastSettledAt instanceof Date ? row.growthLastSettledAt : fallbackNow,
    growthAppliedSpeedBps:
      row.isEquipped !== false ? row.growthAppliedSpeedBps : 0,
  };
}

function growthSnapshotByColor(
  rows: readonly SlimeGrowthRow[],
  now: Date,
): Partial<Record<SlimeColor, SlimeGrowthSnapshot>> {
  const result: Partial<Record<SlimeColor, SlimeGrowthSnapshot>> = {};
  for (const row of rows) {
    const slime = getSlimeDefinition(row.color);
    if (!slime) continue;
    result[slime.color] = calculateSlimeGrowthSnapshot(
      growthStateFromRow(row),
      now,
    );
  }
  return result;
}

function growthEffectsForColors(equippedColors: readonly SlimeColor[]) {
  return calculateCatalogSlimeEffects(equippedColors, []);
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
  const [account, currency, owned, growthRowsResult, ownedItems] = await Promise.all([
    db.studentAccount.findUnique({
      where: { studentId: student.id },
      select: { balance: true },
    }),
    db.classroomCurrency.findUnique({
      where: { classroomId: student.classroomId },
      select: { unitLabel: true },
    }),
    db.studentSlime.findMany({
      // Slime ownership follows the student if they move classrooms. The
      // classroomId remains an audit snapshot of where it was purchased.
      where: { studentId: student.id },
      select: { color: true, isEquipped: true, isRepresentative: true, equippedItemKeys: true },
      orderBy: { createdAt: "asc" },
    }),
    db.studentSlime.findMany({
      where: { studentId: student.id },
      select: slimeGrowthSelect,
      orderBy: { createdAt: "asc" },
    }),
    // The inventory delegate was added with the creature system. Keeping the
    // runtime guard makes older isolated service tests (which mock only slime
    // ownership) continue to exercise the original home response.
    db.studentCreatureItem?.findMany?.({
      where: { studentId: student.id, quantity: { gt: 0 } },
      select: { itemKey: true, isEquipped: true },
      orderBy: { createdAt: "asc" },
    }) ?? Promise.resolve([] as { itemKey: string; isEquipped?: boolean }[]),
  ]);
  if (!account) throw new SlimeServiceError("account_not_found");
  const growthRows = Array.isArray(growthRowsResult) ? growthRowsResult : [];
  const ownedSet = new Set(owned.map((row) => row.color));
  const equippedSet = new Set(
    owned.filter((row) => row.isEquipped !== false).map((row) => row.color),
  );
  const ownedItemKeys = ownedItems
    .map((item) => item.itemKey)
    .filter((itemKey) => Boolean(getSlimeShopItem(itemKey)));
  const equippedItemsByColor = Object.fromEntries(
    owned.map((slime) => [
      slime.color,
      (slime.equippedItemKeys ?? []).filter((itemKey) => Boolean(getSlimeShopItem(itemKey))),
    ]),
  ) as Partial<Record<SlimeColor, string[]>>;
  const equippedItemKeys = Array.from(
    new Set(Object.values(equippedItemsByColor).flatMap((keys) => keys ?? [])),
  );
  const equippedColors = SLIME_CATALOG.map((slime) => slime.color).filter((color) => equippedSet.has(color));
  const effects = calculateCatalogSlimeEffects(equippedColors, equippedItemKeys);
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
  return {
    balance: account.balance,
    currency: { unitLabel: currency?.unitLabel?.trim() || "원" },
    ownedColors: SLIME_CATALOG.map((slime) => slime.color).filter((color) => ownedSet.has(color)),
    equippedColors,
    representativeColor:
      (owned.find((row) => row.isRepresentative)?.color as SlimeColor | undefined) ?? null,
    catalog: SLIME_CATALOG,
    ownedItemKeys,
    equippedItemKeys,
    equippedItemsByColor,
    shopCatalog: SLIME_SHOP_CATALOG,
    effects,
    growthSpeedBps: effects.totals.growth_speed,
    growthByColor,
    growth: growthByColor,
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
    const effects = growthEffectsForColors(nextEquippedColors);
    const growthSpeedBps = effects.totals.growth_speed;
    const updatedRows: SlimeGrowthRow[] = [];

    for (const { row, settled, nextIsEquipped } of settledRows) {
      const nextState = settleSlimeGrowthWithSpeed(
        settled,
        nextIsEquipped ? growthSpeedBps : 0,
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
      const initialEquippedColors = SLIME_CATALOG.map((candidate) => candidate.color).filter(
        (candidate) =>
          candidate === slime.color ||
          existingGrowthRows.some(
            (row) => row.color === candidate && row.isEquipped !== false,
          ),
      );
      const initialGrowthSpeedBps = growthEffectsForColors(initialEquippedColors).totals.growth_speed;

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
            row.isEquipped !== false ? initialGrowthSpeedBps : 0,
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
): Promise<SlimeShopPurchaseResult | null> {
  const transaction = await db.transaction.findFirst({
    where: shopTransactionWhere(student.id, sourceRef),
  });
  if (!transaction) return null;
  if (transaction.note !== shopPurchaseNote(item.key)) {
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
): Promise<SlimeShopPurchaseResult> {
  const item = getSlimeShopItem(itemKey);
  if (!item) throw new SlimeServiceError("unknown_item");
  if (!Number.isSafeInteger(item.price) || item.price <= 0) {
    throw new SlimeServiceError("unknown_item", "Invalid slime item price");
  }

  const sourceRef = slimeShopPurchaseSourceRef(student.id, idempotencyKey);
  const replay = await replaySlimeShopPurchase(student, sourceRef, item);
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
  if (inventory && inventory.quantity > 0) {
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
      if (owned && owned.quantity > 0) {
        throw new SlimeServiceError("already_owned");
      }

      const guarded = await tx.studentAccount.updateMany({
        where: { id: account.id, studentId: student.id, balance: { gte: item.price } },
        data: { balance: { decrement: item.price } },
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
          amount: item.price,
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
            quantity: 1,
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
            quantity: 1,
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
      const resolved = await replaySlimeShopPurchase(student, sourceRef, item);
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
      inventory.itemKind !== `slime-${item.category}` ||
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
      select: { id: true, equippedItemKeys: true },
    });
    for (const ownedSlime of slimes) {
      await tx.studentSlime.update({
        where: { id: ownedSlime.id },
        data: { equippedItemKeys: ownedSlime.equippedItemKeys.filter((key) => key !== item.key) },
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
 * Backgrounds are a single-slot category; other catalog categories may be
 * equipped together. The serializable transaction keeps the category reset
 * and target update atomic under concurrent clicks.
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
  if (!slime || !item || typeof isEquipped !== "boolean") {
    throw new SlimeServiceError("invalid_body");
  }
  // Equip requests are replay-safe state transitions. We still validate the
  // key so malformed callers cannot bypass the ownership/type checks below.
  assertIdempotencyKey(idempotencyKey);

  return serializable(async (tx) => {
    const ownedSlime = await tx.studentSlime.findUnique({
      where: { studentId_color: { studentId: student.id, color: slime.color } },
      select: { id: true, equippedItemKeys: true },
    });
    if (!ownedSlime) throw new SlimeServiceError("not_owned");
    const inventory = await tx.studentCreatureItem.findUnique({
      where: { studentId_itemKey: { studentId: student.id, itemKey: item.key } },
    });
    if (
      !inventory ||
      inventory.itemKind !== `slime-${item.category}` ||
      inventory.quantity < 1
    ) {
      throw new SlimeServiceError("not_owned");
    }

    const slimeRowsBefore = await tx.studentSlime.findMany({
      where: { studentId: student.id },
      select: { id: true, color: true, equippedItemKeys: true },
      orderBy: { createdAt: "asc" },
    });
    const currentKeys = ownedSlime.equippedItemKeys.filter((key: string) => Boolean(getSlimeShopItem(key)));
    const alreadyInRequestedState = currentKeys.includes(item.key) === isEquipped;
    let nextKeys = currentKeys.filter((key) => key !== item.key);
    if (isEquipped) {
      nextKeys = nextKeys.filter((key: string) => getSlimeShopItem(key)?.category !== item.category);
      nextKeys.push(item.key);
      await Promise.all(
        slimeRowsBefore
          .filter((row) => row.color !== slime.color && row.equippedItemKeys.includes(item.key))
          .map((row) =>
            tx.studentSlime.update({
              where: { id: row.id },
              data: { equippedItemKeys: row.equippedItemKeys.filter((key: string) => key !== item.key) },
            }),
          ),
      );
    }
    if (!alreadyInRequestedState || nextKeys.length !== currentKeys.length) {
      await tx.studentSlime.update({ where: { id: ownedSlime.id }, data: { equippedItemKeys: nextKeys } });
    }
    const slimeRows = await tx.studentSlime.findMany({
      where: { studentId: student.id },
      select: { color: true, equippedItemKeys: true },
      orderBy: { createdAt: "asc" },
    });
    const equippedItemsByColor = Object.fromEntries(
      slimeRows.map((row) => [row.color, row.color === slime.color ? nextKeys : row.equippedItemKeys]),
    ) as Partial<Record<SlimeColor, string[]>>;
    const equippedItemKeys = Array.from(new Set(Object.values(equippedItemsByColor).flatMap((keys) => keys ?? [])));
    await tx.studentCreatureItem.update({
      where: { id: inventory.id },
      data: { isEquipped: equippedItemKeys.includes(item.key) },
    });
    return {
      slimeColor: slime.color,
      itemKey: item.key,
      isEquipped,
      equippedItemKeys,
      equippedItemsByColor,
      idempotent: alreadyInRequestedState,
    };
  });
}
