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

export const EGG_PURCHASE_SOURCE_TYPE = "creature_egg_purchase" as const;
export const ITEM_PURCHASE_SOURCE_TYPE = "creature_item_purchase" as const;
export const ITEM_USE_SOURCE_TYPE = "creature_item_use" as const;

export type CreatureServiceErrorCode =
  | "unauthenticated"
  | "invalid_body"
  | "unknown_product"
  | "invalid_quantity"
  | "insufficient_funds"
  | "not_owned"
  | "no_active_creature"
  | "not_found"
  | "active_creature_exists"
  | "idempotency_key_reused"
  | "item_not_applicable"
  | "item_unavailable"
  | "creature_not_hatched"
  | "featured_conflict";

const CREATURE_ERROR_STATUS: Record<CreatureServiceErrorCode, number> = {
  unauthenticated: 401,
  invalid_body: 400,
  unknown_product: 400,
  invalid_quantity: 400,
  insufficient_funds: 402,
  not_owned: 403,
  no_active_creature: 404,
  not_found: 404,
  active_creature_exists: 409,
  idempotency_key_reused: 409,
  item_not_applicable: 409,
  item_unavailable: 409,
  creature_not_hatched: 409,
  featured_conflict: 409,
};

export class CreatureServiceError extends Error {
  readonly code: CreatureServiceErrorCode;
  readonly status: number;

  constructor(code: CreatureServiceErrorCode, message: string = code) {
    super(message);
    this.name = "CreatureServiceError";
    this.code = code;
    this.status = CREATURE_ERROR_STATUS[code];
  }
}

export function isCreatureServiceError(error: unknown): error is CreatureServiceError {
  return error instanceof CreatureServiceError;
}

export const eggPurchaseBodySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("egg"),
      productKey: z.string().trim().min(1).max(100),
      idempotencyKey: z.string().trim().min(1).max(200),
    })
    .strict(),
]);

export const itemPurchaseBodySchema = z
  .object({
    productKey: z.string().trim().min(1).max(100),
    quantity: z.number().int().min(1).max(99),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();

export const itemUseBodySchema = z
  .object({
    itemKey: z.string().trim().min(1).max(100),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();

export const equipBodySchema = z
  .object({ itemKey: z.string().trim().min(1).max(100).nullable() })
  .strict();

export const featureBodySchema = z
  .object({ creatureId: z.string().trim().min(1).max(100) })
  .strict();

type StudentIdentity = { id: string; classroomId: string };

type CreatureForDto = {
  id: string;
  lineKey: string;
  stage: string;
  isActive: boolean;
  isFeatured: boolean;
  progressPoints: number;
  rulesVersion: string;
  catalogRevision: string;
  purchaseMode: string;
  oddsSnapshot?: unknown;
  incubatingStartedAt: Date;
  hatchedAt: Date | null;
  juvenileAt: Date | null;
  evolvedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type InventoryForDto = {
  id: string;
  itemKey: string;
  itemKind: string;
  quantity: number;
  isEquipped: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CreatureDto = {
  id: string;
  lineKey: string;
  nameKo: string | null;
  affinity: string | null;
  stage: CreatureStage;
  isActive: boolean;
  isFeatured: boolean;
  progressPoints: number;
  nextThreshold: number | null;
  rulesVersion: string;
  catalogRevision: string;
  purchaseMode: string;
  packageId: string | null;
  assetPackageId: string | null;
  behaviorSheetId: string | null;
  behaviorSheetPath: string | null;
  oddsSnapshot: unknown;
  incubatingStartedAt: string;
  hatchedAt: string | null;
  juvenileAt: string | null;
  evolvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryDto = {
  id: string;
  itemKey: string;
  itemKind: string;
  quantity: number;
  isEquipped: boolean;
  product: {
    key: string;
    kind: CreatureShopProductKind;
    labelKo: string;
    descriptionKo: string;
    price: number;
    effect: unknown;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EquippedBackground = InventoryDto | null;

export type CreatureCatalogSnapshot = {
  revision: string;
  rulesVersion: string;
  lines: readonly unknown[];
  products: readonly unknown[];
  productsByKind: Record<string, readonly unknown[]>;
  odds: readonly { lineKey: string; weight: number; probability: number }[];
};

export type CreatureHomeSnapshot = {
  active: CreatureDto | null;
  featured: CreatureDto | null;
  collection: CreatureDto[];
  balance: number;
  currency: { unitLabel: string };
  items: InventoryDto[];
  equippedBackground: EquippedBackground;
  catalogRevision: string;
  rulesVersion: string;
};

type EggDraw = {
  lineKey: string;
  purchaseMode: "random" | "affinity";
  catalogRevision: string;
  rulesVersion: string;
  oddsSnapshot: readonly { lineKey: string; weight: number; probability: number }[];
};

type RandomIntFn = (maxExclusive: number) => number;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function stageRank(stage: CreatureStage): number {
  const rank = CREATURE_STAGES.indexOf(stage);
  if (rank < 0) throw new CreatureServiceError("not_found", "Unknown creature stage");
  return rank;
}

function assertIdempotencyKey(idempotencyKey: string): void {
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0 || idempotencyKey.length > 200) {
    throw new CreatureServiceError("invalid_body", "Invalid idempotency key");
  }
}

export function sourceReference(studentId: string, idempotencyKey: string): string {
  assertIdempotencyKey(idempotencyKey);
  return `${studentId}:${idempotencyKey}`;
}

function isKnownProduct(productKey: string): CreatureShopProduct {
  const product = getCreatureShopProduct(productKey);
  if (!product || !product.visible) throw new CreatureServiceError("unknown_product");
  if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 10_000) {
    throw new CreatureServiceError("unknown_product", "Invalid creature product price");
  }
  return product;
}

function oddsForPool(pool: readonly CreatureWeightedLine[]) {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new CreatureServiceError("unknown_product", "Invalid creature odds");
  }
  const lineKeys = new Set<string>();
  for (const entry of pool) {
    if (
      !entry ||
      typeof entry.lineKey !== "string" ||
      lineKeys.has(entry.lineKey) ||
      !getCreatureLine(entry.lineKey) ||
      !Number.isSafeInteger(entry.weight) ||
      entry.weight <= 0
    ) {
      throw new CreatureServiceError("unknown_product", "Invalid creature odds");
    }
    lineKeys.add(entry.lineKey);
  }
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0 || totalWeight > 2 ** 48) {
    throw new CreatureServiceError("unknown_product", "Invalid creature odds");
  }
  return pool.map((entry) => ({
    lineKey: entry.lineKey,
    weight: entry.weight,
    probability: entry.weight / totalWeight,
  }));
}

/** Compute the egg draw once. Retries must reuse the returned draw unchanged. */
export function computeEggDraw(
  productKey: string,
  ownedLineKeys: readonly string[] = [],
  randomInt: RandomIntFn = secureRandomInt,
): EggDraw {
  const product = isKnownProduct(productKey);
  if (product.kind !== "random-egg" && product.kind !== "affinity-egg") {
    throw new CreatureServiceError("item_not_applicable", "Product is not an egg");
  }

  if (product.kind === "affinity-egg") {
    if (product.effect.type !== "affinity-egg") {
      throw new CreatureServiceError("unknown_product", "Invalid affinity egg");
    }
    const pool = buildAffinityEggPool(product.effect.affinity);
    const oddsSnapshot = oddsForPool(pool);
    const totalWeight = oddsSnapshot.reduce((sum, entry) => sum + entry.weight, 0);
    let roll: number;
    try {
      roll = randomInt(totalWeight);
    } catch {
      throw new CreatureServiceError("unknown_product", "Invalid creature draw");
    }
    if (!Number.isSafeInteger(roll) || roll < 0 || roll >= totalWeight) {
      throw new CreatureServiceError("unknown_product", "Invalid creature draw");
    }
    return {
      lineKey: chooseWeightedCreatureLineKey(pool, roll),
      purchaseMode: "affinity",
      catalogRevision: CREATURE_CATALOG_REVISION,
      rulesVersion: CREATURE_RULES_VERSION,
      oddsSnapshot,
    };
  }

  const pool = buildEffectiveRandomEggPool(ownedLineKeys);
  const oddsSnapshot = oddsForPool(pool);
  const totalWeight = oddsSnapshot.reduce((sum, entry) => sum + entry.weight, 0);
  let roll: number;
  try {
    roll = randomInt(totalWeight);
  } catch {
    throw new CreatureServiceError("unknown_product", "Invalid creature draw");
  }
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= totalWeight) {
    throw new CreatureServiceError("unknown_product", "Invalid creature draw");
  }
  return {
    lineKey: chooseWeightedCreatureLineKey(pool, roll),
    purchaseMode: "random",
    catalogRevision: CREATURE_CATALOG_REVISION,
    rulesVersion: CREATURE_RULES_VERSION,
    oddsSnapshot,
  };
}

/** Pure stage transition helper shared by food and hatch-accelerator uses. */
export function resolveProgressTransition(input: {
  stage: CreatureStage;
  progressPoints: number;
  progressDelta: number;
  now?: Date;
}) {
  if (!Number.isSafeInteger(input.progressPoints) || input.progressPoints < 0) {
    throw new CreatureServiceError("not_found", "Invalid creature progress");
  }
  if (!Number.isSafeInteger(input.progressDelta) || input.progressDelta <= 0) {
    throw new CreatureServiceError("invalid_body", "Invalid progress delta");
  }
  const beforeStage = input.stage;
  const beforeRank = stageRank(beforeStage);
  const progressAfter = input.progressPoints + input.progressDelta;
  if (!Number.isSafeInteger(progressAfter)) {
    throw new CreatureServiceError("invalid_body", "Creature progress is out of bounds");
  }
  const naturalStage = getCreatureStageForProgress(progressAfter);
  const afterStage = stageRank(naturalStage) >= beforeRank ? naturalStage : beforeStage;
  const afterRank = stageRank(afterStage);
  const now = input.now ?? new Date();
  return {
    stageBefore: beforeStage,
    stageAfter: afterStage,
    progressBefore: input.progressPoints,
    progressAfter,
    hatchedAt: beforeRank < stageRank("hatchling") && afterRank >= stageRank("hatchling") ? now : null,
    juvenileAt: beforeRank < stageRank("juvenile") && afterRank >= stageRank("juvenile") ? now : null,
    evolvedAt: beforeRank < stageRank("evolved") && afterRank >= stageRank("evolved") ? now : null,
    completedAt: afterStage === "evolved" && beforeStage !== "evolved" ? now : null,
    isActive: afterStage !== "evolved",
  };
}

export function canUseHatchAccelerator(stage: CreatureStage): boolean {
  return stage === "egg";
}

function productDto(product: CreatureShopProduct) {
  return {
    key: product.key,
    kind: product.kind,
    labelKo: product.labelKo,
    descriptionKo: product.descriptionKo,
    price: product.price,
    effect: product.effect,
    visible: product.visible,
  };
}

export function buildCreatureCatalogSnapshot(): CreatureCatalogSnapshot {
  const odds = oddsForPool(CREATURE_RANDOM_EGG_WEIGHTS);
  const lines = CREATURE_LINES.map((line) => ({
    key: line.key,
    affinity: line.affinity,
    nameKo: line.nameKo,
    visualConcept: line.visualConcept,
    visualConceptKo: line.visualConceptKo,
    rarity: line.rarity,
    priceTier: line.priceTier,
    randomEggWeight: line.randomEggWeight,
    stages: line.stages.map((stage) => ({
      stage: stage.stage,
      packageId: stage.packageId,
      behaviorSheetId: stage.behaviorSheetId,
      behaviorSheetPath: stage.behaviorSheetPath,
      behaviors: stage.behaviors.map((behavior) => ({ ...behavior })),
    })),
  }));
  const products = CREATURE_SHOP_PRODUCTS.map(productDto);
  const productsByKind: Record<string, readonly unknown[]> = {};
  for (const product of products) {
    const list = productsByKind[product.kind] ?? [];
    productsByKind[product.kind] = [...list, product];
  }
  return {
    revision: CREATURE_CATALOG_REVISION,
    rulesVersion: CREATURE_RULES_VERSION,
    lines,
    products,
    productsByKind,
    odds,
  };
}

export function resolveCreatureDto(creature: CreatureForDto): CreatureDto {
  if (!CREATURE_STAGES.includes(creature.stage as CreatureStage)) {
    throw new CreatureServiceError("not_found", "Unknown creature stage");
  }
  const stage = creature.stage as CreatureStage;
  const line = getCreatureLine(creature.lineKey);
  const stageDefinition = getCreatureStageDefinition(creature.lineKey, stage);
  const nextStage = getNextCreatureStage(stage);
  return {
    id: creature.id,
    lineKey: creature.lineKey,
    nameKo: line?.nameKo ?? null,
    affinity: line?.affinity ?? null,
    stage,
    isActive: creature.isActive,
    isFeatured: creature.isFeatured,
    progressPoints: creature.progressPoints,
    nextThreshold: nextStage ? getCreatureStageProgressThreshold(nextStage) : null,
    rulesVersion: creature.rulesVersion,
    catalogRevision: creature.catalogRevision,
    purchaseMode: creature.purchaseMode,
    packageId: stageDefinition?.packageId ?? null,
    assetPackageId: stageDefinition?.packageId ?? null,
    behaviorSheetId: stageDefinition?.behaviorSheetId ?? null,
    behaviorSheetPath: stageDefinition?.behaviorSheetPath ?? null,
    oddsSnapshot: creature.oddsSnapshot ?? null,
    incubatingStartedAt: creature.incubatingStartedAt.toISOString(),
    hatchedAt: iso(creature.hatchedAt),
    juvenileAt: iso(creature.juvenileAt),
    evolvedAt: iso(creature.evolvedAt),
    completedAt: iso(creature.completedAt),
    createdAt: creature.createdAt.toISOString(),
    updatedAt: creature.updatedAt.toISOString(),
  };
}

function serializeProductForInventory(product: CreatureShopProduct | undefined) {
  if (!product) return null;
  return {
    key: product.key,
    kind: product.kind,
    labelKo: product.labelKo,
    descriptionKo: product.descriptionKo,
    price: product.price,
    effect: product.effect,
  };
}

export function resolveInventoryDto(inventory: InventoryForDto): InventoryDto {
  return {
    id: inventory.id,
    itemKey: inventory.itemKey,
    itemKind: inventory.itemKind,
    quantity: inventory.quantity,
    isEquipped: inventory.isEquipped,
    product: serializeProductForInventory(getCreatureShopProduct(inventory.itemKey)),
    createdAt: iso(inventory.createdAt),
    updatedAt: iso(inventory.updatedAt),
  };
}

function isP2034(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function isP2002(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Retry only serializable conflicts, preserving all operation inputs. */
export async function retrySerializable<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempts = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempts += 1;
      if (!isP2034(error) || attempts >= maxAttempts) throw error;
    }
  }
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return retrySerializable(
    () => db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    3,
  );
}

function transactionWhere(studentId: string, sourceType: string, sourceRef: string) {
  return {
    sourceType,
    sourceRef,
    account: { studentId },
  };
}

function itemUseWhere(studentId: string, sourceType: string, sourceRef: string) {
  return { studentId, sourceType, sourceRef };
}

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

export type { EggDraw, FeatureResult, ItemPurchaseResult, ItemUseResult, PurchaseResult, StudentIdentity };
