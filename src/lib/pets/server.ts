import "server-only";

import { randomInt, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { ensureAccountFor } from "@/lib/bank";
import { db } from "@/lib/db";
import {
  PET_LINEAGES,
  getPetLineage,
  getPetProduct,
  type PetProduct,
} from "./catalog";
import {
  applyHatchPoints,
  applyPetFood,
  canEvolvePet,
  evolvePet,
  nextEvolutionThreshold,
} from "./progression";

type StudentRef = {
  id: string;
  classroomId: string;
  name?: string;
  number?: number | null;
};

type PetRow = {
  id: string;
  studentId: string;
  lineageId: string;
  stage: number;
  nickname: string | null;
  hatchProgress: number;
  hatchRequired: number;
  experience: number;
  equipped: boolean;
  backgroundKey: string | null;
  acquiredVia: string;
  acquiredAt: Date;
  hatchedAt: Date | null;
  evolvedAt: Date | null;
  updatedAt: Date;
};

type PetItemRow = {
  itemKey: string;
  quantity: number;
};

export type SerializedStudentPet = {
  id: string;
  lineageId: string;
  stage: number;
  nickname: string | null;
  hatchProgress: number;
  hatchRequired: number;
  experience: number;
  equipped: boolean;
  backgroundKey: string | null;
  acquiredVia: string;
  acquiredAt: string;
  hatchedAt: string | null;
  evolvedAt: string | null;
  canEvolve: boolean;
  nextEvolutionXp: number | null;
};

export type PetHomeSnapshot = {
  student: {
    id: string;
    name: string;
    number: number | null;
    classroomId: string;
  };
  balance: number;
  currency: { unitLabel: string };
  pets: SerializedStudentPet[];
  inventory: Record<string, number>;
  dex: Array<{
    lineageId: string;
    eggOwned: boolean;
    discoveredStages: number[];
  }>;
};

const serializePet = (pet: PetRow): SerializedStudentPet => {
  const lineage = getPetLineage(pet.lineageId);
  return {
    id: pet.id,
    lineageId: pet.lineageId,
    stage: pet.stage,
    nickname: pet.nickname,
    hatchProgress: pet.hatchProgress,
    hatchRequired: pet.hatchRequired,
    experience: pet.experience,
    equipped: pet.equipped,
    backgroundKey: pet.backgroundKey,
    acquiredVia: pet.acquiredVia,
    acquiredAt: pet.acquiredAt.toISOString(),
    hatchedAt: pet.hatchedAt?.toISOString() ?? null,
    evolvedAt: pet.evolvedAt?.toISOString() ?? null,
    canEvolve: lineage ? canEvolvePet(lineage, pet) : false,
    nextEvolutionXp: lineage ? nextEvolutionThreshold(lineage, pet.stage) : null,
  };
};

const findStudentPets = (studentId: string): Promise<PetRow[]> => db.$queryRaw<PetRow[]>(Prisma.sql`
  SELECT
    "id", "studentId", "lineageId", "stage", "nickname",
    "hatchProgress", "hatchRequired", "experience", "equipped",
    "backgroundKey", "acquiredVia", "acquiredAt", "hatchedAt",
    "evolvedAt", "updatedAt"
  FROM "StudentPet"
  WHERE "studentId" = ${studentId}
  ORDER BY "equipped" DESC, "acquiredAt" ASC
`);

const findStudentPetItems = (studentId: string): Promise<PetItemRow[]> => db.$queryRaw<PetItemRow[]>(Prisma.sql`
  SELECT "itemKey", "quantity"
  FROM "StudentPetItem"
  WHERE "studentId" = ${studentId} AND "quantity" > 0
  ORDER BY "itemKey" ASC
`);

const findOwnedPet = async (studentId: string, petId: string): Promise<PetRow | null> => {
  const rows = await db.$queryRaw<PetRow[]>(Prisma.sql`
    SELECT
      "id", "studentId", "lineageId", "stage", "nickname",
      "hatchProgress", "hatchRequired", "experience", "equipped",
      "backgroundKey", "acquiredVia", "acquiredAt", "hatchedAt",
      "evolvedAt", "updatedAt"
    FROM "StudentPet"
    WHERE "id" = ${petId} AND "studentId" = ${studentId}
    LIMIT 1
  `);
  return rows[0] ?? null;
};

export async function getPetHome(student: StudentRef): Promise<PetHomeSnapshot> {
  const { accountId } = await ensureAccountFor(student);
  const [account, currency, pets, items] = await Promise.all([
    db.studentAccount.findUnique({
      where: { id: accountId },
      select: { balance: true },
    }),
    db.classroomCurrency.findUnique({
      where: { classroomId: student.classroomId },
      select: { unitLabel: true },
    }),
    findStudentPets(student.id),
    findStudentPetItems(student.id),
  ]);

  const inventory = Object.fromEntries(items.map((item) => [item.itemKey, item.quantity]));
  const dex = PET_LINEAGES.map((lineage) => {
    const owned = pets.filter((pet) => pet.lineageId === lineage.id);
    return {
      lineageId: lineage.id,
      eggOwned: owned.length > 0,
      discoveredStages: [...new Set(owned.filter((pet) => pet.stage > 0).map((pet) => pet.stage))]
        .sort((left, right) => left - right),
    };
  });

  return {
    student: {
      id: student.id,
      name: student.name ?? "학생",
      number: student.number ?? null,
      classroomId: student.classroomId,
    },
    balance: account?.balance ?? 0,
    currency: { unitLabel: currency?.unitLabel ?? "원" },
    pets: pets.map(serializePet),
    inventory,
    dex,
  };
}

export type PetPurchaseError =
  | "invalid_body"
  | "product_not_found"
  | "lineage_not_found"
  | "insufficient_funds"
  | "already_owned"
  | "account_not_found";

export type PetPurchaseResult =
  | {
      ok: true;
      balance: number;
      product: PetProduct;
      petId: string | null;
      lineageId: string | null;
      itemKey: string | null;
    }
  | { ok: false; error: PetPurchaseError };

export function chooseRandomPetLineage(randomValue?: number) {
  const total = PET_LINEAGES.reduce((sum, lineage) => sum + lineage.randomWeight, 0);
  let cursor = randomValue === undefined
    ? randomInt(total)
    : Math.min(total - 1, Math.max(0, Math.trunc(randomValue)));
  for (const lineage of PET_LINEAGES) {
    if (cursor < lineage.randomWeight) return lineage;
    cursor -= lineage.randomWeight;
  }
  return PET_LINEAGES[0];
}

export async function purchasePetProduct(
  student: StudentRef,
  productKey: string,
): Promise<PetPurchaseResult> {
  const product = getPetProduct(productKey);
  if (!product) return { ok: false, error: "product_not_found" };
  if (product.price < 0 || !Number.isSafeInteger(product.price)) {
    return { ok: false, error: "invalid_body" };
  }

  const lineage = product.kind === "egg"
    ? product.random
      ? chooseRandomPetLineage()
      : product.lineageId
        ? getPetLineage(product.lineageId)
        : null
    : null;
  if (product.kind === "egg" && !lineage) {
    return { ok: false, error: "lineage_not_found" };
  }

  const { accountId } = await ensureAccountFor(student);

  return db.$transaction(async (tx): Promise<PetPurchaseResult> => {
    // Serialize every pet-shop purchase for one wallet before checking durable
    // ownership. This prevents two concurrent requests from both charging for
    // the same one-time background effect.
    const accountLock = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "StudentAccount"
      WHERE "id" = ${accountId}
      FOR UPDATE
    `);
    if (!accountLock[0]) return { ok: false, error: "account_not_found" };

    if (product.durable && product.itemKey) {
      const owned = await tx.$queryRaw<Array<{ quantity: number }>>(Prisma.sql`
        SELECT "quantity"
        FROM "StudentPetItem"
        WHERE "studentId" = ${student.id} AND "itemKey" = ${product.itemKey}
        LIMIT 1
      `);
      if ((owned[0]?.quantity ?? 0) > 0) {
        return { ok: false, error: "already_owned" };
      }
    }

    // The conditional update is the balance gate. Concurrent purchases cannot
    // spend more units than the locked wallet contains.
    const charged = await tx.studentAccount.updateMany({
      where: { id: accountId, balance: { gte: product.price } },
      data: { balance: { decrement: product.price } },
    });
    if (charged.count === 0) {
      const accountExists = await tx.studentAccount.findUnique({
        where: { id: accountId },
        select: { id: true },
      });
      return {
        ok: false,
        error: accountExists ? "insufficient_funds" : "account_not_found",
      };
    }

    const updatedAccount = await tx.studentAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { balance: true },
    });
    const transaction = await tx.transaction.create({
      data: {
        accountId,
        type: "pet_purchase",
        amount: product.price,
        balanceAfter: updatedAccount.balance,
        note: `원소 펫: ${product.name}`,
        performedById: student.id,
        performedByKind: "owner",
      },
    });

    let petId: string | null = null;
    let lineageId: string | null = null;
    let itemKey: string | null = null;

    if (product.kind === "egg" && lineage) {
      // Updating the account above serializes purchases for one student, so
      // this first-pet check and the partial unique equipped index stay race-safe.
      const existing = await tx.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
        SELECT EXISTS(
          SELECT 1 FROM "StudentPet" WHERE "studentId" = ${student.id}
        ) AS "exists"
      `);
      petId = randomUUID();
      lineageId = lineage.id;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "StudentPet" (
          "id", "studentId", "lineageId", "stage", "hatchProgress",
          "hatchRequired", "experience", "equipped", "acquiredVia",
          "acquiredAt", "updatedAt"
        ) VALUES (
          ${petId}, ${student.id}, ${lineage.id}, 0, 0,
          ${lineage.egg.hatchPoints}, 0, ${existing[0]?.exists !== true}, ${product.key},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
    } else if (product.itemKey) {
      itemKey = product.itemKey;
      const itemId = randomUUID();
      if (product.durable) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "StudentPetItem" (
            "id", "studentId", "itemKey", "quantity", "createdAt", "updatedAt"
          ) VALUES (
            ${itemId}, ${student.id}, ${product.itemKey}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT ("studentId", "itemKey")
          DO UPDATE SET "quantity" = 1, "updatedAt" = CURRENT_TIMESTAMP
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "StudentPetItem" (
            "id", "studentId", "itemKey", "quantity", "createdAt", "updatedAt"
          ) VALUES (
            ${itemId}, ${student.id}, ${product.itemKey}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          ON CONFLICT ("studentId", "itemKey")
          DO UPDATE SET
            "quantity" = "StudentPetItem"."quantity" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        `);
      }
    }

    const metadata = lineageId
      ? JSON.stringify({ lineageId, random: product.random === true })
      : null;
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PetPurchase" (
        "id", "studentId", "productKey", "productKind", "unitPrice",
        "quantity", "transactionId", "resultPetId", "metadata", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${student.id}, ${product.key}, ${product.kind}, ${product.price},
        1, ${transaction.id}, ${petId}, CAST(${metadata} AS JSONB), CURRENT_TIMESTAMP
      )
    `);

    return {
      ok: true,
      balance: updatedAccount.balance,
      product,
      petId,
      lineageId,
      itemKey,
    };
  });
}

export type PetActionInput =
  | { action: "feed"; petId: string; itemKey: string }
  | { action: "accelerate"; petId: string; itemKey: string }
  | { action: "evolve"; petId: string }
  | { action: "equip"; petId: string }
  | { action: "set-background"; petId: string; itemKey: string | null }
  | { action: "rename"; petId: string; nickname: string | null };

export type PetActionError =
  | "invalid_body"
  | "pet_not_found"
  | "lineage_not_found"
  | "item_not_found"
  | "item_not_owned"
  | "wrong_item_kind"
  | "not_ready"
  | "invalid_name";

export type PetActionEvent =
  | "fed"
  | "accelerated"
  | "hatched"
  | "evolved"
  | "equipped"
  | "background"
  | "renamed";

export type PetActionResult =
  | { ok: true; petId: string; event: PetActionEvent }
  | { ok: false; error: PetActionError };

export async function performPetAction(
  student: StudentRef,
  input: PetActionInput,
): Promise<PetActionResult> {
  if (!input.petId) return { ok: false, error: "invalid_body" };
  const pet = await findOwnedPet(student.id, input.petId);
  if (!pet) return { ok: false, error: "pet_not_found" };
  if (!getPetLineage(pet.lineageId)) {
    return { ok: false, error: "lineage_not_found" };
  }

  if (input.action === "equip") {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "StudentPet"
        WHERE "studentId" = ${student.id}
        FOR UPDATE
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "StudentPet"
        SET "equipped" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "studentId" = ${student.id} AND "equipped" = TRUE
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "StudentPet"
        SET "equipped" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${pet.id} AND "studentId" = ${student.id}
      `);
    });
    return { ok: true, petId: pet.id, event: "equipped" };
  }

  if (input.action === "set-background") {
    if (input.itemKey !== null) {
      const product = getPetProduct(input.itemKey);
      if (!product || product.kind !== "background" || !product.itemKey) {
        return { ok: false, error: "wrong_item_kind" };
      }
      const owned = await db.$queryRaw<Array<{ quantity: number }>>(Prisma.sql`
        SELECT "quantity"
        FROM "StudentPetItem"
        WHERE "studentId" = ${student.id} AND "itemKey" = ${product.itemKey}
        LIMIT 1
      `);
      if ((owned[0]?.quantity ?? 0) < 1) {
        return { ok: false, error: "item_not_owned" };
      }
    }
    await db.$executeRaw(Prisma.sql`
      UPDATE "StudentPet"
      SET "backgroundKey" = ${input.itemKey}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${pet.id} AND "studentId" = ${student.id}
    `);
    return { ok: true, petId: pet.id, event: "background" };
  }

  if (input.action === "rename") {
    const nickname = input.nickname?.trim() || null;
    if (nickname && (nickname.length > 12 || /[\u0000-\u001f\u007f]/.test(nickname))) {
      return { ok: false, error: "invalid_name" };
    }
    await db.$executeRaw(Prisma.sql`
      UPDATE "StudentPet"
      SET "nickname" = ${nickname}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${pet.id} AND "studentId" = ${student.id}
    `);
    return { ok: true, petId: pet.id, event: "renamed" };
  }

  if (input.action === "evolve") {
    return db.$transaction(async (tx): Promise<PetActionResult> => {
      const rows = await tx.$queryRaw<PetRow[]>(Prisma.sql`
        SELECT
          "id", "studentId", "lineageId", "stage", "nickname",
          "hatchProgress", "hatchRequired", "experience", "equipped",
          "backgroundKey", "acquiredVia", "acquiredAt", "hatchedAt",
          "evolvedAt", "updatedAt"
        FROM "StudentPet"
        WHERE "id" = ${pet.id} AND "studentId" = ${student.id}
        FOR UPDATE
      `);
      const freshPet = rows[0];
      if (!freshPet) return { ok: false, error: "pet_not_found" };
      const lineage = getPetLineage(freshPet.lineageId);
      if (!lineage) return { ok: false, error: "lineage_not_found" };
      const next = evolvePet(lineage, freshPet);
      if (!next) return { ok: false, error: "not_ready" };
      await tx.$executeRaw(Prisma.sql`
        UPDATE "StudentPet"
        SET
          "stage" = ${next.stage},
          "evolvedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${freshPet.id} AND "studentId" = ${student.id}
      `);
      return { ok: true, petId: freshPet.id, event: "evolved" };
    });
  }

  const product = getPetProduct(input.itemKey);
  if (!product || !product.itemKey) {
    return { ok: false, error: "item_not_found" };
  }
  if (input.action === "feed" && product.kind !== "food") {
    return { ok: false, error: "wrong_item_kind" };
  }
  if (input.action === "accelerate" && product.kind !== "accelerator") {
    return { ok: false, error: "wrong_item_kind" };
  }

  return db.$transaction(async (tx): Promise<PetActionResult> => {
    const rows = await tx.$queryRaw<PetRow[]>(Prisma.sql`
      SELECT
        "id", "studentId", "lineageId", "stage", "nickname",
        "hatchProgress", "hatchRequired", "experience", "equipped",
        "backgroundKey", "acquiredVia", "acquiredAt", "hatchedAt",
        "evolvedAt", "updatedAt"
      FROM "StudentPet"
      WHERE "id" = ${pet.id} AND "studentId" = ${student.id}
      FOR UPDATE
    `);
    const freshPet = rows[0];
    if (!freshPet) return { ok: false, error: "pet_not_found" };
    if (input.action === "accelerate" && freshPet.stage !== 0) {
      return { ok: false, error: "not_ready" };
    }

    const consumed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "StudentPetItem"
      SET "quantity" = "quantity" - 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "studentId" = ${student.id}
        AND "itemKey" = ${product.itemKey}
        AND "quantity" > 0
      RETURNING "id"
    `);
    if (consumed.length === 0) {
      return { ok: false, error: "item_not_owned" };
    }

    const next = input.action === "feed"
      ? applyPetFood(freshPet, product)
      : applyHatchPoints(freshPet, product.hatchPoints ?? 0);
    const event: PetActionEvent = next.hatched
      ? "hatched"
      : input.action === "accelerate"
        ? "accelerated"
        : "fed";

    await tx.$executeRaw(Prisma.sql`
      UPDATE "StudentPet"
      SET
        "stage" = ${next.stage},
        "hatchProgress" = ${next.hatchProgress},
        "hatchRequired" = ${next.hatchRequired},
        "experience" = ${next.experience},
        "hatchedAt" = CASE
          WHEN ${next.hatched} THEN CURRENT_TIMESTAMP
          ELSE "hatchedAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${freshPet.id} AND "studentId" = ${student.id}
    `);
    return { ok: true, petId: freshPet.id, event };
  });
}
