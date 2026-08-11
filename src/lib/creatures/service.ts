import "server-only";

import { Prisma } from "@prisma/client";
import { randomInt as secureRandomInt } from "node:crypto";
import { z } from "zod";

import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import {
  CREATURE_CATALOG_REVISION,
  CREATURE_LINES,
  CREATURE_RANDOM_EGG_WEIGHTS,
  CREATURE_RULES_VERSION,
  CREATURE_SHOP_PRODUCTS,
  CREATURE_STAGES,
  buildAffinityEggPool,
  buildEffectiveRandomEggPool,
  chooseWeightedCreatureLineKey,
  getCreatureLine,
  getCreatureShopProduct,
  getCreatureStageDefinition,
  getCreatureStageForProgress,
  getCreatureStageProgressThreshold,
  getNextCreatureStage,
  type CreatureShopProduct,
  type CreatureShopProductKind,
  type CreatureStage,
  type CreatureWeightedLine,
} from "@/lib/creatures/catalog";
export {
  EGG_PURCHASE_SOURCE_TYPE, ITEM_PURCHASE_SOURCE_TYPE, ITEM_USE_SOURCE_TYPE,
  CreatureServiceError, isCreatureServiceError, eggPurchaseBodySchema, itemPurchaseBodySchema,
  itemUseBodySchema, equipBodySchema, featureBodySchema, sourceReference, computeEggDraw,
  resolveProgressTransition, canUseHatchAccelerator, buildCreatureCatalogSnapshot,
  resolveCreatureDto, resolveInventoryDto, retrySerializable,
} from "./service-core";
export type { CreatureServiceErrorCode, CreatureDto, InventoryDto, EquippedBackground, CreatureCatalogSnapshot, CreatureHomeSnapshot, EggDraw, StudentIdentity } from "./service-core";
import {
  EGG_PURCHASE_SOURCE_TYPE, ITEM_PURCHASE_SOURCE_TYPE, ITEM_USE_SOURCE_TYPE, CreatureServiceError,
  type CreatureServiceErrorCode, type CreatureDto, type InventoryDto, type EquippedBackground,
  type CreatureHomeSnapshot, type EggDraw, type RandomIntFn, type StudentIdentity,
  asJson, iso, assertIdempotencyKey, sourceReference, isKnownProduct, computeEggDraw,
  buildCreatureCatalogSnapshot, resolveCreatureDto, resolveInventoryDto, retrySerializable,
  canUseHatchAccelerator, resolveProgressTransition,
  serializable, transactionWhere, itemUseWhere, isP2002, CREATURE_ERROR_STATUS,
} from "./service-core";

type PurchaseResult = {
  creature: CreatureDto;
  transactionId: string;
  balance: number;
  draw: {
    lineKey: string;
    catalogRevision: string;
    rulesVersion: string;
    purchaseMode: "random" | "affinity";
    oddsSnapshot: readonly { lineKey: string; weight: number; probability: number }[];
  };
  idempotent: boolean;
};

function eggPurchaseNote(productKey: string): string {
  return `creature-egg-purchase:${productKey}`;
}

function matchesEggPurchaseNote(note: string | null, productKey: string): boolean {
  return note === eggPurchaseNote(productKey);
}

async function replayEggPurchase(
  student: StudentIdentity,
  sourceRef: string,
  productKey: string,
): Promise<PurchaseResult | null> {
  const transaction = await db.transaction.findFirst({
    where: transactionWhere(student.id, EGG_PURCHASE_SOURCE_TYPE, sourceRef),
    include: { creatureEggPurchase: true },
  });
  if (!transaction) return null;
  if (!matchesEggPurchaseNote(transaction.note, productKey)) {
    throw new CreatureServiceError("idempotency_key_reused");
  }
  const creature = transaction.creatureEggPurchase;
  if (!creature) throw new CreatureServiceError("idempotency_key_reused", "Purchase source already exists");
  const account = await db.studentAccount.findUnique({ where: { id: transaction.accountId }, select: { balance: true } });
  return {
    creature: resolveCreatureDto(creature),
    transactionId: transaction.id,
    balance: account?.balance ?? transaction.balanceAfter,
    draw: {
      lineKey: creature.lineKey,
      catalogRevision: creature.catalogRevision,
      rulesVersion: creature.rulesVersion,
      purchaseMode: creature.purchaseMode === "affinity" ? "affinity" : "random",
      oddsSnapshot: (creature.oddsSnapshot as unknown as typeof EMPTY_ODDS) ?? [],
    },
    idempotent: true,
  };
}

const EMPTY_ODDS: readonly { lineKey: string; weight: number; probability: number }[] = [];

export async function purchaseCreatureEgg(
  student: StudentIdentity,
  productKey: string,
  idempotencyKey: string,
  randomInt?: RandomIntFn,
): Promise<PurchaseResult> {
  assertIdempotencyKey(idempotencyKey);
  const product = isKnownProduct(productKey);
  if (product.kind !== "random-egg" && product.kind !== "affinity-egg") {
    throw new CreatureServiceError("item_not_applicable", "Product is not an egg");
  }
  if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 10_000) {
    throw new CreatureServiceError("unknown_product", "Invalid creature product price");
  }

  const { accountId } = await ensureAccountFor(student);
  const sourceRef = sourceReference(student.id, idempotencyKey);
  const replay = await replayEggPurchase(student, sourceRef, productKey);
  if (replay) return replay;
  const owned = await db.studentCreature.findMany({ where: { studentId: student.id }, select: { lineKey: true } });
  const draw = computeEggDraw(productKey, owned.map((row) => row.lineKey), randomInt ?? secureRandomInt);
  const line = getCreatureLine(draw.lineKey);
  if (!line) throw new CreatureServiceError("unknown_product", "Invalid creature line");

  try {
    return await serializable(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: transactionWhere(student.id, EGG_PURCHASE_SOURCE_TYPE, sourceRef),
        include: { creatureEggPurchase: true },
      });
      if (existing) {
        if (!matchesEggPurchaseNote(existing.note, productKey) || !existing.creatureEggPurchase) {
          throw new CreatureServiceError("idempotency_key_reused");
        }
        const currentAccount = await tx.studentAccount.findUnique({ where: { id: existing.accountId }, select: { balance: true } });
        return {
          creature: resolveCreatureDto(existing.creatureEggPurchase),
          transactionId: existing.id,
          balance: currentAccount?.balance ?? existing.balanceAfter,
          draw: {
            lineKey: existing.creatureEggPurchase.lineKey,
            catalogRevision: existing.creatureEggPurchase.catalogRevision,
            rulesVersion: existing.creatureEggPurchase.rulesVersion,
            purchaseMode: existing.creatureEggPurchase.purchaseMode === "affinity" ? "affinity" as const : "random" as const,
            oddsSnapshot: (existing.creatureEggPurchase.oddsSnapshot as unknown as typeof EMPTY_ODDS) ?? EMPTY_ODDS,
          },
          idempotent: true,
        } satisfies PurchaseResult;
      }
      const active = await tx.studentCreature.findFirst({ where: { studentId: student.id, isActive: true } });
      if (active) throw new CreatureServiceError("active_creature_exists");

      const guarded = await tx.studentAccount.updateMany({
        where: { id: accountId, balance: { gte: product.price } },
        data: { balance: { decrement: product.price } },
      });
      if (guarded.count !== 1) throw new CreatureServiceError("insufficient_funds");
      const account = await tx.studentAccount.findUnique({ where: { id: accountId }, select: { balance: true } });
      if (!account) throw new CreatureServiceError("not_found", "Student account not found");

      const transaction = await tx.transaction.create({
        data: {
          accountId,
          type: EGG_PURCHASE_SOURCE_TYPE,
          amount: product.price,
          balanceAfter: account.balance,
          note: eggPurchaseNote(product.key),
          sourceType: EGG_PURCHASE_SOURCE_TYPE,
          sourceRef,
          performedById: student.id,
          performedByKind: "owner",
        },
      });
      const creature = await tx.studentCreature.create({
        data: {
          studentId: student.id,
          classroomId: student.classroomId,
          lineKey: line.key,
          stage: "egg",
          isActive: true,
          progressPoints: 0,
          rulesVersion: draw.rulesVersion,
          catalogRevision: draw.catalogRevision,
          purchaseMode: draw.purchaseMode,
          oddsSnapshot: asJson(draw.oddsSnapshot),
          originSourceType: EGG_PURCHASE_SOURCE_TYPE,
          originSourceRef: sourceRef,
          purchaseTransactionId: transaction.id,
        },
      });
      return {
        creature: resolveCreatureDto(creature),
        transactionId: transaction.id,
        balance: account.balance,
        draw,
        idempotent: false,
      } satisfies PurchaseResult;
    });
  } catch (error) {
    if (isP2002(error)) {
      const resolved = await replayEggPurchase(student, sourceRef, productKey);
      if (resolved) return resolved;
      throw new CreatureServiceError("idempotency_key_reused");
    }
    throw error;
  }
}

type ItemPurchaseResult = {
  inventory: InventoryDto;
  balance: number;
  transactionId: string;
  idempotent: boolean;
};

function itemPurchaseNote(productKey: string, quantity: number): string {
  return `creature-item-purchase:${productKey}:${quantity}`;
}

function parseItemPurchaseNote(note: string | null): { productKey: string; quantity: number } | null {
  if (!note) return null;
  const match = /^creature-item-purchase:([^:]+):(\d+)$/.exec(note);
  if (!match) return null;
  const quantity = Number(match[2]);
  return Number.isSafeInteger(quantity) ? { productKey: match[1], quantity } : null;
}

async function replayItemPurchase(student: StudentIdentity, sourceRef: string, productKey: string, quantity: number): Promise<ItemPurchaseResult | null> {
  const transaction = await db.transaction.findFirst({ where: transactionWhere(student.id, ITEM_PURCHASE_SOURCE_TYPE, sourceRef) });
  if (!transaction) return null;
  const parsed = parseItemPurchaseNote(transaction.note);
  if (!parsed || parsed.productKey !== productKey || parsed.quantity !== quantity) {
    throw new CreatureServiceError("idempotency_key_reused");
  }
  const inventory = await db.studentCreatureItem.findUnique({
    where: { studentId_itemKey: { studentId: student.id, itemKey: productKey } },
  });
  if (!inventory) throw new CreatureServiceError("idempotency_key_reused");
  const account = await db.studentAccount.findUnique({ where: { id: transaction.accountId }, select: { balance: true } });
  return {
    inventory: resolveInventoryDto(inventory),
    balance: account?.balance ?? transaction.balanceAfter,
    transactionId: transaction.id,
    idempotent: true,
  };
}

export async function purchaseCreatureItem(
  student: StudentIdentity,
  productKey: string,
  quantity: number,
  idempotencyKey: string,
): Promise<ItemPurchaseResult> {
  assertIdempotencyKey(idempotencyKey);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new CreatureServiceError("invalid_quantity");
  }
  const product = isKnownProduct(productKey);
  if (product.kind === "random-egg" || product.kind === "affinity-egg") {
    throw new CreatureServiceError("item_not_applicable", "Eggs use the egg purchase endpoint");
  }
  const { accountId } = await ensureAccountFor(student);
  const sourceRef = sourceReference(student.id, idempotencyKey);
  const replay = await replayItemPurchase(student, sourceRef, productKey, quantity);
  if (replay) return replay;
  const totalPrice = product.price * quantity;

  try {
    return await serializable(async (tx) => {
      const existing = await tx.transaction.findFirst({ where: transactionWhere(student.id, ITEM_PURCHASE_SOURCE_TYPE, sourceRef) });
      if (existing) {
        const parsed = parseItemPurchaseNote(existing.note);
        if (!parsed || parsed.productKey !== productKey || parsed.quantity !== quantity) {
          throw new CreatureServiceError("idempotency_key_reused");
        }
        const inventory = await tx.studentCreatureItem.findUnique({ where: { studentId_itemKey: { studentId: student.id, itemKey: productKey } } });
        if (!inventory) throw new CreatureServiceError("idempotency_key_reused");
        const currentAccount = await tx.studentAccount.findUnique({ where: { id: existing.accountId }, select: { balance: true } });
        return { inventory: resolveInventoryDto(inventory), balance: currentAccount?.balance ?? existing.balanceAfter, transactionId: existing.id, idempotent: true } satisfies ItemPurchaseResult;
      }
      const guarded = await tx.studentAccount.updateMany({
        where: { id: accountId, balance: { gte: totalPrice } },
        data: { balance: { decrement: totalPrice } },
      });
      if (guarded.count !== 1) throw new CreatureServiceError("insufficient_funds");
      const account = await tx.studentAccount.findUnique({ where: { id: accountId }, select: { balance: true } });
      if (!account) throw new CreatureServiceError("not_found", "Student account not found");
      const transaction = await tx.transaction.create({
        data: {
          accountId,
          type: ITEM_PURCHASE_SOURCE_TYPE,
          amount: totalPrice,
          balanceAfter: account.balance,
          note: itemPurchaseNote(productKey, quantity),
          sourceType: ITEM_PURCHASE_SOURCE_TYPE,
          sourceRef,
          performedById: student.id,
          performedByKind: "owner",
        },
      });
      const inventory = await tx.studentCreatureItem.upsert({
        where: { studentId_itemKey: { studentId: student.id, itemKey: productKey } },
        create: { studentId: student.id, classroomId: student.classroomId, itemKey: productKey, itemKind: product.kind, quantity },
        update: { quantity: { increment: quantity }, itemKind: product.kind },
      });
      return { inventory: resolveInventoryDto(inventory), balance: account.balance, transactionId: transaction.id, idempotent: false } satisfies ItemPurchaseResult;
    });
  } catch (error) {
    if (isP2002(error)) {
      const resolved = await replayItemPurchase(student, sourceRef, productKey, quantity);
      if (resolved) return resolved;
      throw new CreatureServiceError("idempotency_key_reused");
    }
    throw error;
  }
}

type UseDto = {
  id: string;
  itemKey: string;
  itemKind: string;
  quantity: number;
  effect: unknown;
  progressBefore: number;
  progressAfter: number;
  stageBefore: string;
  stageAfter: string;
  idempotencyKey: string;
  sourceType: string;
  sourceRef: string;
  usedAt: string;
};

type ItemUseResult = {
  use: UseDto;
  creature: CreatureDto;
  inventory: InventoryDto;
  idempotent: boolean;
};

function resolveUseDto(use: {
  id: string;
  itemKey: string;
  itemKind: string;
  quantity: number;
  effectSnapshot: unknown;
  progressBefore: number;
  progressAfter: number;
  stageBefore: string;
  stageAfter: string;
  idempotencyKey: string;
  sourceType: string;
  sourceRef: string;
  usedAt: Date;
}): UseDto {
  return {
    id: use.id,
    itemKey: use.itemKey,
    itemKind: use.itemKind,
    quantity: use.quantity,
    effect: use.effectSnapshot,
    progressBefore: use.progressBefore,
    progressAfter: use.progressAfter,
    stageBefore: use.stageBefore,
    stageAfter: use.stageAfter,
    idempotencyKey: use.idempotencyKey,
    sourceType: use.sourceType,
    sourceRef: use.sourceRef,
    usedAt: use.usedAt.toISOString(),
  };
}

async function inventorySnapshot(student: StudentIdentity, itemKey?: string): Promise<InventoryDto[]> {
  const rows = await db.studentCreatureItem.findMany({
    where: { studentId: student.id, ...(itemKey ? { itemKey } : {}), quantity: { gt: 0 } },
    orderBy: { itemKey: "asc" },
  });
  return rows.map(resolveInventoryDto);
}

async function replayItemUse(student: StudentIdentity, sourceRef: string, itemKey: string): Promise<ItemUseResult | null> {
  const use = await db.creatureItemUse.findFirst({
    where: itemUseWhere(student.id, ITEM_USE_SOURCE_TYPE, sourceRef),
    include: { creature: true, inventoryItem: true },
  });
  if (!use) return null;
  if (use.itemKey !== itemKey) throw new CreatureServiceError("idempotency_key_reused");
  if (!use.creature || !use.inventoryItem) throw new CreatureServiceError("idempotency_key_reused");
  return {
    use: resolveUseDto(use),
    creature: resolveCreatureDto(use.creature),
    inventory: resolveInventoryDto(use.inventoryItem),
    idempotent: true,
  };
}

export async function useCreatureItem(
  student: StudentIdentity,
  itemKey: string,
  idempotencyKey: string,
): Promise<ItemUseResult> {
  assertIdempotencyKey(idempotencyKey);
  const product = isKnownProduct(itemKey);
  if (product.kind === "random-egg" || product.kind === "affinity-egg" || product.kind === "background-effect") {
    throw new CreatureServiceError("item_not_applicable");
  }
  const sourceRef = sourceReference(student.id, idempotencyKey);
  const replay = await replayItemUse(student, sourceRef, itemKey);
  if (replay) return replay;
  await ensureAccountFor(student);

  try {
    return await serializable(async (tx) => {
      const existing = await tx.creatureItemUse.findFirst({
        where: itemUseWhere(student.id, ITEM_USE_SOURCE_TYPE, sourceRef),
        include: { creature: true, inventoryItem: true },
      });
      if (existing) {
        if (existing.itemKey !== itemKey || !existing.creature || !existing.inventoryItem) throw new CreatureServiceError("idempotency_key_reused");
        return {
          use: resolveUseDto(existing),
          creature: resolveCreatureDto(existing.creature),
          inventory: resolveInventoryDto(existing.inventoryItem),
          idempotent: true,
        } satisfies ItemUseResult;
      }
      const creature = await tx.studentCreature.findFirst({ where: { studentId: student.id, isActive: true }, orderBy: { createdAt: "desc" } });
      if (!creature) throw new CreatureServiceError("no_active_creature");
      const stage = creature.stage as CreatureStage;
      if (!CREATURE_STAGES.includes(stage)) throw new CreatureServiceError("not_found", "Unknown creature stage");
      if (product.kind === "hatch-accelerator" && !canUseHatchAccelerator(stage)) throw new CreatureServiceError("item_not_applicable");

      const inventory = await tx.studentCreatureItem.findUnique({ where: { studentId_itemKey: { studentId: student.id, itemKey } } });
      if (!inventory || inventory.itemKind !== product.kind || inventory.quantity < 1) throw new CreatureServiceError("item_unavailable");
      const guarded = await tx.studentCreatureItem.updateMany({
        where: { id: inventory.id, quantity: { gte: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (guarded.count !== 1) throw new CreatureServiceError("item_unavailable");

      const effect = product.effect;
      const progressDelta =
        effect.type === "food"
          ? effect.progressPoints
          : effect.type === "hatch-accelerator"
            ? effect.hatchProgressPoints
            : 0;
      if (progressDelta <= 0) throw new CreatureServiceError("item_not_applicable");
      const now = new Date();
      const transition = resolveProgressTransition({ stage, progressPoints: creature.progressPoints, progressDelta, now });
      const existingFeatured = transition.hatchedAt
        ? await tx.studentCreature.findFirst({
            where: { studentId: student.id, isFeatured: true },
            select: { id: true },
          })
        : null;
      const updatedCreature = await tx.studentCreature.update({
        where: { id: creature.id },
        data: {
          progressPoints: transition.progressAfter,
          stage: transition.stageAfter,
          isActive: transition.isActive,
          ...(transition.hatchedAt && !existingFeatured ? { isFeatured: true } : {}),
          ...(transition.hatchedAt ? { hatchedAt: transition.hatchedAt } : {}),
          ...(transition.juvenileAt ? { juvenileAt: transition.juvenileAt } : {}),
          ...(transition.evolvedAt ? { evolvedAt: transition.evolvedAt } : {}),
          ...(transition.completedAt ? { completedAt: transition.completedAt } : {}),
        },
      });
      const use = await tx.creatureItemUse.create({
        data: {
          studentId: student.id,
          classroomId: student.classroomId,
          studentCreatureId: creature.id,
          inventoryItemId: inventory.id,
          itemKey,
          itemKind: product.kind,
          quantity: 1,
          effectSnapshot: asJson(effect),
          progressBefore: transition.progressBefore,
          progressAfter: transition.progressAfter,
          stageBefore: transition.stageBefore,
          stageAfter: transition.stageAfter,
          idempotencyKey: sourceRef,
          sourceType: ITEM_USE_SOURCE_TYPE,
          sourceRef,
          usedAt: now,
        },
      });
      const updatedInventory = await tx.studentCreatureItem.findUnique({ where: { id: inventory.id } });
      if (!updatedInventory) throw new CreatureServiceError("not_found", "Inventory row disappeared");
      return {
        use: resolveUseDto(use),
        creature: resolveCreatureDto(updatedCreature),
        inventory: resolveInventoryDto(updatedInventory),
        idempotent: false,
      } satisfies ItemUseResult;
    });
  } catch (error) {
    if (isP2002(error)) {
      const resolved = await replayItemUse(student, sourceRef, itemKey);
      if (resolved) return resolved;
      throw new CreatureServiceError("idempotency_key_reused");
    }
    throw error;
  }
}

type EquipResult = { equippedBackground: EquippedBackground };

export async function equipCreatureBackground(student: StudentIdentity, itemKey: string | null): Promise<EquipResult> {
  if (itemKey !== null) {
    const product = isKnownProduct(itemKey);
    if (product.kind !== "background-effect") throw new CreatureServiceError("item_not_applicable");
  }
  await ensureAccountFor(student);
  return serializable(async (tx) => {
    await tx.studentCreatureItem.updateMany({ where: { studentId: student.id, itemKind: "background-effect" }, data: { isEquipped: false } });
    if (itemKey === null) return { equippedBackground: null };
    const inventory = await tx.studentCreatureItem.findUnique({ where: { studentId_itemKey: { studentId: student.id, itemKey } } });
    if (!inventory || inventory.itemKind !== "background-effect" || inventory.quantity < 1) throw new CreatureServiceError("not_owned");
    const equipped = await tx.studentCreatureItem.update({ where: { id: inventory.id }, data: { isEquipped: true } });
    return { equippedBackground: resolveInventoryDto(equipped) };
  });
}

type FeatureResult = { featured: CreatureDto };

export async function featureCreature(
  student: StudentIdentity,
  creatureId: string,
): Promise<FeatureResult> {
  const selectFeatured = () => serializable(async (tx) => {
    const creature = await tx.studentCreature.findFirst({
      where: {
        id: creatureId,
        studentId: student.id,
        classroomId: student.classroomId,
      },
    });
    if (!creature) throw new CreatureServiceError("not_found", "Creature not found");
    if (creature.stage === "egg") throw new CreatureServiceError("creature_not_hatched");

    await tx.studentCreature.updateMany({
      where: { studentId: student.id, isFeatured: true, id: { not: creature.id } },
      data: { isFeatured: false },
    });
    const featured = creature.isFeatured
      ? creature
      : await tx.studentCreature.update({
          where: { id: creature.id },
          data: { isFeatured: true },
        });
    return { featured: resolveCreatureDto(featured) };
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await selectFeatured();
    } catch (error) {
      // A concurrent switch can briefly hit the reviewed partial unique index.
      // The failed transaction rolled back, so a fresh serializable retry is safe.
      if (!isP2002(error)) throw error;
    }
  }
  throw new CreatureServiceError("featured_conflict");
}

export async function getStudentCreatures(student: StudentIdentity): Promise<CreatureHomeSnapshot> {
  const { accountId } = await ensureAccountFor(student);
  const [account, currency, rows, inventoryRows] = await Promise.all([
    db.studentAccount.findUnique({ where: { id: accountId }, select: { balance: true } }),
    db.classroomCurrency.findUnique({ where: { classroomId: student.classroomId }, select: { unitLabel: true } }),
    db.studentCreature.findMany({ where: { studentId: student.id }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.studentCreatureItem.findMany({ where: { studentId: student.id, quantity: { gt: 0 } }, orderBy: { itemKey: "asc" } }),
  ]);
  const dtos = rows.map(resolveCreatureDto);
  const active = dtos.find((creature) => creature.isActive) ?? null;
  const featured = dtos.find((creature) => creature.isFeatured && creature.stage !== "egg") ?? null;
  const collection = dtos.filter((creature) => !creature.isActive);
  const items = inventoryRows.map(resolveInventoryDto);
  const equippedBackground = items.find((item) => item.itemKind === "background-effect" && item.isEquipped) ?? null;
  return {
    active,
    featured,
    collection,
    balance: account?.balance ?? 0,
    currency: { unitLabel: currency?.unitLabel ?? "원" },
    items,
    equippedBackground,
    catalogRevision: CREATURE_CATALOG_REVISION,
    rulesVersion: CREATURE_RULES_VERSION,
  };
}

export function errorStatus(error: CreatureServiceErrorCode): number {
  return CREATURE_ERROR_STATUS[error];
}

export type { FeatureResult, ItemPurchaseResult, ItemUseResult, PurchaseResult };
