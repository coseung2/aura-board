import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { SLIME_SHOP_CATALOG } from "./catalog";
import { equipSlimeShopItem, SlimeServiceError } from "./service";

const student = { id: "student-1", classroomId: "classroom-1" };
const background = SLIME_SHOP_CATALOG[0];

function installState(overrides: Partial<{ quantity: number; isEquipped: boolean; itemKind: string }> = {}) {
  const rows = new Map([
    [
      background.key,
      {
        id: "inventory-1",
        studentId: student.id,
        itemKey: background.key,
        itemKind: `slime-${background.category}`,
        quantity: 1,
        isEquipped: false,
        ...overrides,
      },
    ],
  ]);
  const inventory = {
    findUnique: vi.fn(async ({ where }: { where: { studentId_itemKey: { itemKey: string } } }) =>
      rows.get(where.studentId_itemKey.itemKey) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: { studentId: string; itemKind: string; itemKey?: { not: string }; isEquipped?: boolean }; data: { isEquipped: boolean } }) => {
      let count = 0;
      for (const row of rows.values()) {
        if (
          row.studentId === where.studentId &&
          row.itemKind === where.itemKind &&
          (where.itemKey === undefined || row.itemKey !== where.itemKey.not) &&
          (where.isEquipped === undefined || row.isEquipped === where.isEquipped)
        ) {
          row.isEquipped = data.isEquipped;
          count += 1;
        }
      }
      return { count };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { isEquipped: boolean } }) => {
      const row = [...rows.values()].find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("missing inventory");
      row.isEquipped = data.isEquipped;
      return row;
    }),
    findMany: vi.fn(async () => [...rows.values()]),
  };
  const slimeRows = [
    { id: "slime-1", studentId: student.id, color: "blue", equippedItemKeys: [] as string[] },
  ];
  const slimes = {
    findUnique: vi.fn(async () => slimeRows[0]),
    findMany: vi.fn(async () => slimeRows),
    updateMany: vi.fn(async () => ({ count: 0 })),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { equippedItemKeys: string[] } }) => {
      const row = slimeRows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("missing slime");
      row.equippedItemKeys = data.equippedItemKeys;
      return row;
    }),
  };
  mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
    operation({ studentCreatureItem: inventory, studentSlime: slimes }),
  );
  return { rows, inventory, slimeRows, slimes };
}

describe("slime shop item equipment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies, removes, and replays an owned item without duplicating state", async () => {
    const state = installState();

    const applied = await equipSlimeShopItem(student, "blue", background.key, true, "equip-1");
    expect(applied).toMatchObject({
      slimeColor: "blue",
      itemKey: background.key,
      isEquipped: true,
      equippedItemKeys: [background.key],
      idempotent: false,
    });
    expect(state.rows.get(background.key)?.isEquipped).toBe(true);

    const replay = await equipSlimeShopItem(student, "blue", background.key, true, "equip-1");
    expect(replay).toMatchObject({ isEquipped: true, idempotent: true });
    expect(state.slimes.update).toHaveBeenCalledTimes(1);

    const removed = await equipSlimeShopItem(student, "blue", background.key, false, "equip-2");
    expect(removed).toMatchObject({
      itemKey: background.key,
      isEquipped: false,
      equippedItemKeys: [],
      idempotent: false,
    });
  });

  it("blocks unowned, empty, and mismatched item rows", async () => {
    const missing = installState({ quantity: 0 });
    await expect(
      equipSlimeShopItem(student, "blue", background.key, true, "missing"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "not_owned", status: 403 });
    expect(missing.rows.get(background.key)?.isEquipped).toBe(false);

    const wrongKind = installState({ itemKind: "creature-food" });
    await expect(
      equipSlimeShopItem(student, "blue", background.key, true, "wrong-kind"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "not_owned", status: 403 });
    expect(wrongKind.inventory.update).not.toHaveBeenCalled();
  });
});
