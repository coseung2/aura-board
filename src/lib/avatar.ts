// Server-only helpers for the avatar customization MVP (2026-07-02).
//
// Source-of-truth: the existing StudentAccount.balance + Transaction table
// stays untouched. Avatar purchases reuse the same Transaction table with
// `type = "avatar_purchase"`. This file is the *only* place that knows the
// avatar data shape; routes under /api/avatar/** call into these helpers.
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { ensureAccountFor } from "./bank";

// ---------- Types --------------------------------------------------------

export type SerializedAvatarItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  slot: string | null;
  rarity: string;
  price: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  metadata: unknown;
  classroomId: string | null;
  archived: boolean;
};

export type AvatarPurchaseError =
  | "unauthenticated"
  | "not_found"
  | "archived"
  | "already_owned"
  | "insufficient_funds"
  | "forbidden"
  | "invalid_body";

export type AvatarPurchaseResult =
  | { ok: true; balance: number; inventoryItemIds: string[] }
  | { ok: false; error: AvatarPurchaseError };

// ---------- Default catalog ---------------------------------------------

// Lazy-seeded on first catalog read. Art is intentionally null; the
// frontend can render metadata-driven placeholders until the art pipeline
// ships. Once art exists we just backfill `imageUrl` / `thumbnailUrl`.
type DefaultSeed = {
  key: string;
  name: string;
  description: string;
  category: string;
  slot: string | null;
  rarity: string;
  price: number;
  metadata: Record<string, unknown>;
};

const DEFAULT_SEEDS: DefaultSeed[] = [
  {
    key: "default-skin-01",
    name: "기본 피부",
    description: "모든 학생이 처음부터 갖고 있는 기본 아바타 스킨.",
    category: "skin",
    slot: "skin",
    rarity: "common",
    price: 0,
    metadata: { color: "#f4c9a3", placeholder: true },
  },
  {
    key: "default-background-01",
    name: "교실 배경",
    description: "기본 교실 무대 배경.",
    category: "background",
    slot: "background",
    rarity: "common",
    price: 0,
    metadata: { color: "#cfe6ff", placeholder: true },
  },
  {
    key: "default-hair-01",
    name: "기본 머리",
    description: "처음 캐릭터에 어울리는 기본 머리.",
    category: "hair",
    slot: "hair",
    rarity: "common",
    price: 0,
    metadata: { color: "#4a3426", placeholder: true },
  },
  {
    key: "default-top-01",
    name: "기본 상의",
    description: "처음 캐릭터에 어울리는 파란 상의.",
    category: "top",
    slot: "top",
    rarity: "common",
    price: 0,
    metadata: { color: "#1683c7", placeholder: true },
  },
  {
    key: "default-bottom-01",
    name: "기본 하의",
    description: "처음 캐릭터에 어울리는 기본 하의.",
    category: "bottom",
    slot: "bottom",
    rarity: "common",
    price: 0,
    metadata: { color: "#3b82f6", placeholder: true },
  },
  {
    key: "default-shoes-01",
    name: "기본 신발",
    description: "처음 캐릭터에 어울리는 기본 신발.",
    category: "shoes",
    slot: "shoes",
    rarity: "common",
    price: 0,
    metadata: { color: "#1f2937", placeholder: true },
  },
  {
    key: "skin-rose-01",
    name: "로즈 피부",
    description: "따뜻한 분홍빛 피부 톤.",
    category: "skin",
    slot: "skin",
    rarity: "rare",
    price: 200,
    metadata: { color: "#f1a7a0" },
  },
  {
    key: "skin-olive-01",
    name: "올리브 피부",
    description: "자연스러운 올리브 톤.",
    category: "skin",
    slot: "skin",
    rarity: "rare",
    price: 200,
    metadata: { color: "#c9a877" },
  },
  {
    key: "hair-choco-01",
    name: "초코 머리",
    description: "짙은 초콜릿색 머리.",
    category: "hair",
    slot: "hair",
    rarity: "common",
    price: 90,
    metadata: { color: "#5c3624" },
  },
  {
    key: "top-mint-01",
    name: "민트 상의",
    description: "밝은 민트색 상의.",
    category: "top",
    slot: "top",
    rarity: "common",
    price: 120,
    metadata: { color: "#2fbf9f" },
  },
  {
    key: "bottom-navy-01",
    name: "네이비 하의",
    description: "단정한 네이비 하의.",
    category: "bottom",
    slot: "bottom",
    rarity: "common",
    price: 120,
    metadata: { color: "#334155" },
  },
  {
    key: "shoes-red-01",
    name: "빨간 신발",
    description: "멀리서도 잘 보이는 빨간 신발.",
    category: "shoes",
    slot: "shoes",
    rarity: "common",
    price: 100,
    metadata: { color: "#ef4444" },
  },
  {
    key: "background-sunset-01",
    name: "노을 배경",
    description: "석양이 물든 배경.",
    category: "background",
    slot: "background",
    rarity: "rare",
    price: 180,
    metadata: { colors: ["#ffb37b", "#ff6f91"] },
  },
  {
    key: "background-forest-01",
    name: "숲속 배경",
    description: "초록빛 숲속 무대.",
    category: "background",
    slot: "background",
    rarity: "rare",
    price: 180,
    metadata: { colors: ["#9ad3a3", "#3b7a4a"] },
  },
  {
    key: "accessory-glasses-01",
    name: "동그란 안경",
    description: "귀여운 동그란 프레임 안경.",
    category: "accessory",
    slot: "accessory",
    rarity: "common",
    price: 80,
    metadata: { shape: "round", color: "#222" },
  },
  {
    key: "accessory-cap-01",
    name: "운동 모자",
    description: "스포츠한 운동 모자.",
    category: "accessory",
    slot: "accessory",
    rarity: "common",
    price: 80,
    metadata: { shape: "cap", color: "#3366cc" },
  },
  {
    key: "pet-cat-01",
    name: "동반 고양이",
    description: "아바타 옆에 앉는 작은 고양이.",
    category: "pet",
    slot: "pet",
    rarity: "epic",
    price: 600,
    metadata: { species: "cat", color: "#ffb37b" },
  },
];

const STARTER_ITEM_KEYS = [
  "default-skin-01",
  "default-background-01",
  "default-hair-01",
  "default-top-01",
  "default-bottom-01",
  "default-shoes-01",
];

// Insert any system items that don't exist yet. App-level uniqueness
// (since SQLite/Postgres treat NULL classroomId as distinct in the
// composite index). Idempotent.
export async function ensureDefaultAvatarItems(): Promise<void> {
  const existing = await db.avatarItem.findMany({
    where: { classroomId: null },
    select: { key: true },
  });
  const have = new Set(existing.map((r) => r.key));
  const missing = DEFAULT_SEEDS.filter((s) => !have.has(s.key));
  if (missing.length === 0) return;
  await db.$transaction(
    missing.map((seed) =>
      db.avatarItem.create({
        data: {
          classroomId: null,
          key: seed.key,
          name: seed.name,
          description: seed.description,
          category: seed.category,
          slot: seed.slot,
          rarity: seed.rarity,
          price: seed.price,
          imageUrl: null,
          thumbnailUrl: null,
          metadata: seed.metadata as Prisma.InputJsonValue,
        },
      }),
    ),
  );
}

async function ensureStarterAvatarInventory(studentId: string): Promise<void> {
  const starterItems = await db.avatarItem.findMany({
    where: { classroomId: null, key: { in: STARTER_ITEM_KEYS } },
    select: { id: true },
  });
  if (starterItems.length === 0) return;

  await db.avatarInventoryItem.createMany({
    data: starterItems.map((item) => ({
      studentId,
      itemId: item.id,
      acquiredVia: "starter",
      sourceRef: "default-starter-pack",
    })),
    skipDuplicates: true,
  });
}

// ---------- Serializers --------------------------------------------------

export function serializeAvatarItem(item: {
  id: string;
  classroomId: string | null;
  key: string;
  name: string;
  description: string | null;
  category: string;
  slot: string | null;
  rarity: string;
  price: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  metadata: unknown;
  archived: boolean;
}): SerializedAvatarItem {
  return {
    id: item.id,
    key: item.key,
    name: item.name,
    description: item.description,
    category: item.category,
    slot: item.slot,
    rarity: item.rarity,
    price: item.price,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    metadata: item.metadata,
    classroomId: item.classroomId,
    archived: item.archived,
  };
}

// ---------- Loadout helpers ---------------------------------------------

// Idempotent: creates the AvatarLoadout row on first call.
export async function ensureAvatarLoadout(studentId: string): Promise<{ id: string }> {
  const existing = await db.avatarLoadout.findUnique({ where: { studentId } });
  if (existing) return { id: existing.id };
  return db.avatarLoadout.create({ data: { studentId } });
}

// ---------- Catalog / home snapshot -------------------------------------

export type AvatarHomeSnapshot = {
  student: { id: string; name: string; number: number | null; classroomId: string };
  balance: number;
  currency: { unitLabel: string };
  items: SerializedAvatarItem[];
  inventoryItemIds: string[];
  // Slot -> itemId map for the current equipped items. null means the slot
  // is explicitly empty (e.g. after an unequip). Missing keys are treated
  // as null by the frontend.
  equipped: Record<string, string | null>;
  galleryVisible: boolean;
};

export async function getAvatarHome(student: {
  id: string;
  name: string;
  number: number | null;
  classroomId: string;
}): Promise<AvatarHomeSnapshot> {
  await ensureDefaultAvatarItems();
  await ensureStarterAvatarInventory(student.id);
  const [{ accountId }, currency, items, inventory, loadout, gallery] = await Promise.all([
    ensureAccountFor(student),
    db.classroomCurrency.findUnique({ where: { classroomId: student.classroomId } }),
    db.avatarItem.findMany({
      where: {
        archived: false,
        OR: [{ classroomId: null }, { classroomId: student.classroomId }],
      },
      orderBy: [{ price: "asc" }, { name: "asc" }],
    }),
    db.avatarInventoryItem.findMany({
      where: { studentId: student.id },
      select: { id: true, itemId: true },
    }),
    db.avatarLoadout.findUnique({
      where: { studentId: student.id },
      include: { items: true },
    }),
    db.avatarGalleryEntry.findUnique({
      where: {
        classroomId_studentId: {
          classroomId: student.classroomId,
          studentId: student.id,
        },
      },
    }),
  ]);

  const account = await db.studentAccount.findUnique({
    where: { id: accountId },
    select: { balance: true },
  });

  const equipped: Record<string, string | null> = {};
  for (const li of loadout?.items ?? []) {
    equipped[li.slot] = li.itemId;
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      number: student.number,
      classroomId: student.classroomId,
    },
    balance: account?.balance ?? 0,
    currency: { unitLabel: currency?.unitLabel ?? "원" },
    items: items.map(serializeAvatarItem),
    inventoryItemIds: inventory.map((row) => row.itemId),
    equipped,
    galleryVisible: !!gallery && gallery.revokedAt === null,
  };
}

// ---------- Purchase -----------------------------------------------------

export async function purchaseAvatarItem(
  student: { id: string; classroomId: string },
  itemId: string,
): Promise<AvatarPurchaseResult> {
  if (!itemId || typeof itemId !== "string") {
    return { ok: false, error: "invalid_body" };
  }
  const item = await db.avatarItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "not_found" };
  if (item.archived) return { ok: false, error: "archived" };
  // classroomId-scoped items must belong to the student's classroom.
  if (item.classroomId && item.classroomId !== student.classroomId) {
    return { ok: false, error: "forbidden" };
  }
  if (item.price < 0) return { ok: false, error: "forbidden" };

  const { accountId } = await ensureAccountFor(student);

  type TxShape =
    | { ok: true; balance: number; inventoryItemIds: string[]; _inventoryId: string }
    | { ok: false; error: AvatarPurchaseError };

  const txResult: TxShape = await db.$transaction(async (tx) => {
    const owned = await tx.avatarInventoryItem.findUnique({
      where: { studentId_itemId: { studentId: student.id, itemId: item.id } },
      select: { id: true },
    });
    if (owned) return { ok: false, error: "already_owned" as const };

    const acc = await tx.studentAccount.findUnique({
      where: { id: accountId },
      select: { id: true, balance: true },
    });
    if (!acc) return { ok: false, error: "not_found" as const };
    if (acc.balance < item.price) {
      return { ok: false, error: "insufficient_funds" as const };
    }

    const updated = await tx.studentAccount.update({
      where: { id: acc.id },
      data: { balance: { decrement: item.price } },
      select: { balance: true },
    });

    // Per existing Transaction convention: store purchases write a single
    // Transaction with positive `amount` and `balanceAfter` recorded
    // after the decrement; the note carries the cart line.
    const trx = await tx.transaction.create({
      data: {
        accountId: acc.id,
        type: "avatar_purchase",
        amount: item.price,
        balanceAfter: updated.balance,
        note: "아바타 아이템: " + item.name,
        performedById: student.id,
        performedByKind: "owner",
      },
    });

    const inv = await tx.avatarInventoryItem.create({
      data: {
        studentId: student.id,
        itemId: item.id,
        acquiredVia: "purchase",
        sourceRef: trx.id,
      },
    });

    await tx.avatarPurchase.create({
      data: {
        studentId: student.id,
        itemId: item.id,
        unitPrice: item.price,
        status: "succeeded",
        transactionId: trx.id,
      },
    });

    const inventoryItemIds = (
      await tx.avatarInventoryItem.findMany({
        where: { studentId: student.id },
        select: { itemId: true },
      })
    ).map((row) => row.itemId);

    return {
      ok: true as const,
      balance: updated.balance,
      inventoryItemIds,
      _inventoryId: inv.id,
    };
  });

  if (txResult.ok) {
    const { _inventoryId: _ignored, ...pub } = txResult;
    return pub;
  }
  return txResult;
}

// ---------- Loadout updates ---------------------------------------------

export type EquipsInput = Array<{ slot: string; itemId: string | null }>;

export type UpdateLoadoutError =
  | "unauthenticated"
  | "not_owned"
  | "slot_mismatch"
  | "not_found";

export type UpdateLoadoutResult =
  | { ok: true; equipped: Record<string, string | null> }
  | { ok: false; error: UpdateLoadoutError };

export async function updateAvatarLoadout(
  student: { id: string; classroomId: string },
  equips: EquipsInput,
): Promise<UpdateLoadoutResult> {
  if (!Array.isArray(equips)) return { ok: false, error: "not_found" };
  for (const e of equips) {
    if (!e || typeof e.slot !== "string" || e.slot.length === 0) {
      return { ok: false, error: "not_found" };
    }
    if (e.itemId !== null && typeof e.itemId !== "string") {
      return { ok: false, error: "not_found" };
    }
  }
  // De-duplicate by slot: last write wins.
  const bySlot = new Map<string, string | null>();
  for (const e of equips) bySlot.set(e.slot, e.itemId);

  const loadout = await ensureAvatarLoadout(student.id);

  const itemIdsToCheck = Array.from(bySlot.values()).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  let ownedItems: { id: string; slot: string | null; classroomId: string | null }[] = [];
  if (itemIdsToCheck.length > 0) {
    const owned = await db.avatarInventoryItem.findMany({
      where: { studentId: student.id, itemId: { in: itemIdsToCheck } },
      select: { itemId: true },
    });
    const ownedSet = new Set(owned.map((row) => row.itemId));
    for (const id of itemIdsToCheck) {
      if (!ownedSet.has(id)) return { ok: false, error: "not_owned" };
    }
    ownedItems = await db.avatarItem.findMany({
      where: { id: { in: itemIdsToCheck } },
      select: { id: true, slot: true, classroomId: true },
    });
  }
  const itemMeta = new Map(ownedItems.map((row) => [row.id, row]));

  for (const [slot, itemId] of bySlot) {
    if (itemId === null) continue;
    const meta = itemMeta.get(itemId);
    if (!meta) return { ok: false, error: "not_owned" };
    if (meta.slot !== slot) return { ok: false, error: "slot_mismatch" };
    if (meta.classroomId && meta.classroomId !== student.classroomId) {
      return { ok: false, error: "slot_mismatch" };
    }
  }

  await db.$transaction(
    Array.from(bySlot.entries()).map(([slot, itemId]) =>
      db.avatarLoadoutItem.upsert({
        where: { loadoutId_slot: { loadoutId: loadout.id, slot } },
        create: { loadoutId: loadout.id, slot, itemId },
        update: { itemId },
      }),
    ),
  );

  const fresh = await db.avatarLoadoutItem.findMany({
    where: { loadoutId: loadout.id },
    select: { slot: true, itemId: true },
  });
  const equipped: Record<string, string | null> = {};
  for (const row of fresh) equipped[row.slot] = row.itemId;
  return { ok: true, equipped };
}

// ---------- Gallery visibility ------------------------------------------

export async function setAvatarGalleryVisibility(
  student: { id: string; classroomId: string },
  visible: boolean,
): Promise<{ galleryVisible: boolean }> {
  const existing = await db.avatarGalleryEntry.findUnique({
    where: {
      classroomId_studentId: {
        classroomId: student.classroomId,
        studentId: student.id,
      },
    },
  });
  if (visible) {
    if (existing && existing.revokedAt === null) {
      return { galleryVisible: true };
    }
    if (existing) {
      await db.avatarGalleryEntry.update({
        where: { id: existing.id },
        data: { revokedAt: null, visibleFrom: new Date() },
      });
    } else {
      await db.avatarGalleryEntry.create({
        data: { classroomId: student.classroomId, studentId: student.id },
      });
    }
    return { galleryVisible: true };
  }
  if (existing && existing.revokedAt === null) {
    await db.avatarGalleryEntry.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }
  return { galleryVisible: false };
}

// ---------- Gallery read (classmates) -----------------------------------

export type GalleryPeer = {
  id: string;
  studentId: string;
  name: string;
  number: number | null;
  gender: string | null;
  equipped: Record<string, string | null>;
  galleryVisible: boolean;
};

export async function getClassroomGallery(classroomId: string): Promise<GalleryPeer[]> {
  await ensureDefaultAvatarItems();
  const students = await db.student.findMany({
    where: { classroomId },
    select: { id: true, name: true, number: true, gender: true },
    orderBy: [{ number: "asc" }, { name: "asc" }],
  });
  if (students.length === 0) return [];
  const ids = students.map((s) => s.id);

  const [loadouts, galleryRows] = await Promise.all([
    db.avatarLoadout.findMany({
      where: { studentId: { in: ids } },
      include: { items: { select: { slot: true, itemId: true } } },
    }),
    db.avatarGalleryEntry.findMany({
      where: { classroomId, studentId: { in: ids }, revokedAt: null },
      select: { studentId: true },
    }),
  ]);
  const loadoutByStudent = new Map(loadouts.map((l) => [l.studentId, l.items]));
  const visibleSet = new Set(galleryRows.map((g) => g.studentId));

  return students.map((s) => {
    const items = loadoutByStudent.get(s.id) ?? [];
    const equipped: Record<string, string | null> = {};
    for (const it of items) equipped[it.slot] = it.itemId;
    return {
      id: s.id,
      studentId: s.id,
      name: s.name,
      number: s.number,
      gender: s.gender,
      equipped,
      galleryVisible: visibleSet.has(s.id),
    };
  });
}
