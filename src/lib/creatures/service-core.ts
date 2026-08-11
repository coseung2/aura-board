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

export const CREATURE_ERROR_STATUS: Record<CreatureServiceErrorCode, number> = {
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

export type StudentIdentity = { id: string; classroomId: string };

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

export type EggDraw = {
  lineKey: string;
  purchaseMode: "random" | "affinity";
  catalogRevision: string;
  rulesVersion: string;
  oddsSnapshot: readonly { lineKey: string; weight: number; probability: number }[];
};

export type RandomIntFn = (maxExclusive: number) => number;

export function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function stageRank(stage: CreatureStage): number {
  const rank = CREATURE_STAGES.indexOf(stage);
  if (rank < 0) throw new CreatureServiceError("not_found", "Unknown creature stage");
  return rank;
}

export function assertIdempotencyKey(idempotencyKey: string): void {
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0 || idempotencyKey.length > 200) {
    throw new CreatureServiceError("invalid_body", "Invalid idempotency key");
  }
}

export function sourceReference(studentId: string, idempotencyKey: string): string {
  assertIdempotencyKey(idempotencyKey);
  return `${studentId}:${idempotencyKey}`;
}

export function isKnownProduct(productKey: string): CreatureShopProduct {
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

export function isP2002(error: unknown): boolean {
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

export async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return retrySerializable(
    () => db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    3,
  );
}

export function transactionWhere(studentId: string, sourceType: string, sourceRef: string) {
  return {
    sourceType,
    sourceRef,
    account: { studentId },
  };
}

export function itemUseWhere(studentId: string, sourceType: string, sourceRef: string) {
  return { studentId, sourceType, sourceRef };
}
