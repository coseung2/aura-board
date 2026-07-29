import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { SLIME_SHOP_CATALOG } from "./catalog";
import { equipSlimeShopItem, setSlimeShopItemHidden, SlimeServiceError } from "./service";

const student = { id: "student-1", classroomId: "classroom-1" };
const background = SLIME_SHOP_CATALOG[0];

function installState(overrides: Partial<{ quantity: number; isEquipped: boolean; itemKind: string }> = {}) {
  const rows = new Map(SLIME_SHOP_CATALOG.map((item, index) => [
    item.key,
    {
      id: `inventory-${index + 1}`,
      studentId: student.id,
      itemKey: item.key,
      itemKind: `slime-${item.category}`,
      quantity: 1,
      isEquipped: false,
      ...(item.key === background.key ? overrides : {}),
    },
  ]));
  const inventory = {
    findUnique: vi.fn(async ({ where }: { where: { studentId_itemKey: { itemKey: string } } }) =>
      rows.get(where.studentId_itemKey.itemKey) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: { studentId: string; itemKey?: { in: string[] } }; data: { isEquipped: boolean } }) => {
      let count = 0;
      for (const row of rows.values()) {
        if (
          row.studentId === where.studentId &&
          (where.itemKey === undefined || where.itemKey.in.includes(row.itemKey))
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
    {
      id: "slime-1",
      studentId: student.id,
      color: "blue",
      isRepresentative: true,
      equippedItemKeys: [] as string[],
      hiddenItemKeys: [] as string[],
    },
  ];
  const slimes = {
    findUnique: vi.fn(async () => slimeRows[0]),
    findMany: vi.fn(async () => slimeRows),
    updateMany: vi.fn(async () => ({ count: 0 })),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { equippedItemKeys?: string[]; hiddenItemKeys?: string[] } }) => {
      const row = slimeRows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error("missing slime");
      if (data.equippedItemKeys) row.equippedItemKeys = data.equippedItemKeys;
      if (data.hiddenItemKeys) row.hiddenItemKeys = data.hiddenItemKeys;
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
      equippedFloorByColor: { blue: "grass-floor" },
      equippedFloor: "grass-floor",
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

  it("replaces a floor across legacy categories without removing non-floor items", async () => {
    const state = installState();
    const stone = SLIME_SHOP_CATALOG.find((item) => item.floor === "stone-floor")!;
    const snow = SLIME_SHOP_CATALOG.find((item) => item.floor === "snow-ground-floor")!;
    const drink = SLIME_SHOP_CATALOG.find((item) => item.category === "drink")!;
    state.slimeRows[0].equippedItemKeys = [stone.key, drink.key];

    const result = await equipSlimeShopItem(student, "blue", snow.key, true, "floor-swap");

    expect(result).toMatchObject({
      equippedItemKeys: [snow.key, drink.key],
      equippedItemsByColor: { blue: [snow.key, drink.key] },
      equippedFloorByColor: { blue: "snow-ground-floor" },
      equippedFloor: "snow-ground-floor",
      idempotent: false,
    });
    expect(state.rows.get(stone.key)?.isEquipped).toBe(false);
    expect(state.rows.get(snow.key)?.isEquipped).toBe(true);
  });

  it("keeps one floor with one accessory and replaces only the accessory slot", async () => {
    const state = installState();
    const grass = SLIME_SHOP_CATALOG.find((item) => item.floor === "grass-floor")!;
    const drink = SLIME_SHOP_CATALOG.find((item) => item.category === "drink")!;
    const ball = SLIME_SHOP_CATALOG.find((item) => item.category === "prop")!;
    state.slimeRows[0].equippedItemKeys = [grass.key, drink.key];

    const result = await equipSlimeShopItem(student, "blue", ball.key, true, "accessory-swap");

    expect(result.equippedItemKeys).toEqual([grass.key, ball.key]);
    expect(result.equippedFloorByColor).toEqual({ blue: "grass-floor" });
    expect(state.rows.get(drink.key)?.isEquipped).toBe(false);
    expect(state.rows.get(ball.key)?.isEquipped).toBe(true);
  });

  it("equips blush, eyewear, and headwear together while replacing only the matching slot", async () => {
    const state = installState();
    const peach = SLIME_SHOP_CATALOG.find((item) => item.wearableRole === "blush")!;
    const rose = SLIME_SHOP_CATALOG.find((item) =>
      item.wearableRole === "blush" && item.key !== peach.key)!;
    const eyewear = SLIME_SHOP_CATALOG.find((item) => item.wearableRole === "eyewear")!;
    const headwear = SLIME_SHOP_CATALOG.find((item) => item.wearableRole === "headwear")!;
    state.slimeRows[0].equippedItemKeys = [peach.key, eyewear.key, headwear.key];
    state.rows.get(peach.key)!.isEquipped = true;
    state.rows.get(eyewear.key)!.isEquipped = true;
    state.rows.get(headwear.key)!.isEquipped = true;

    const result = await equipSlimeShopItem(student, "blue", rose.key, true, "blush-swap");

    expect(result.equippedItemKeys).toEqual([rose.key, eyewear.key, headwear.key]);
    expect(state.rows.get(peach.key)?.isEquipped).toBe(false);
    expect(state.rows.get(rose.key)?.isEquipped).toBe(true);
    expect(state.rows.get(eyewear.key)?.isEquipped).toBe(true);
    expect(state.rows.get(headwear.key)?.isEquipped).toBe(true);
  });

  it("equips a scene background without replacing the floor or accessory", async () => {
    const state = installState();
    const scene = SLIME_SHOP_CATALOG.find((item) =>
      item.category === "background" && item.floor === null)!;
    const floor = SLIME_SHOP_CATALOG.find((item) => item.floor === "grass-floor")!;
    const accessory = SLIME_SHOP_CATALOG.find((item) => item.category === "drink")!;
    state.slimeRows[0].equippedItemKeys = [accessory.key, floor.key];
    state.rows.get(floor.key)!.isEquipped = true;
    state.rows.get(accessory.key)!.isEquipped = true;

    const result = await equipSlimeShopItem(student, "blue", scene.key, true, "scene-background");

    expect(result.equippedItemKeys).toEqual([scene.key, floor.key, accessory.key]);
    expect(result.equippedItemsByColor).toEqual({
      blue: [scene.key, floor.key, accessory.key],
    });
    expect(result.equippedFloorByColor).toEqual({ blue: "grass-floor" });
    expect(state.rows.get(scene.key)?.isEquipped).toBe(true);
    expect(state.rows.get(floor.key)?.isEquipped).toBe(true);
    expect(state.rows.get(accessory.key)?.isEquipped).toBe(true);
  });

  it("removes only the scene background from a complete visual loadout", async () => {
    const state = installState();
    const scene = SLIME_SHOP_CATALOG.find((item) =>
      item.category === "background" && item.floor === null)!;
    const legacyFloor = SLIME_SHOP_CATALOG.find((item) => item.key === "grass-floor-background")!;
    const accessory = SLIME_SHOP_CATALOG.find((item) => item.category === "prop")!;
    state.slimeRows[0].equippedItemKeys = [scene.key, legacyFloor.key, accessory.key];
    state.rows.get(scene.key)!.isEquipped = true;
    state.rows.get(legacyFloor.key)!.isEquipped = true;
    state.rows.get(accessory.key)!.isEquipped = true;

    const result = await equipSlimeShopItem(student, "blue", scene.key, false, "remove-scene");

    expect(result.equippedItemKeys).toEqual([legacyFloor.key, accessory.key]);
    expect(result.equippedFloorByColor).toEqual({ blue: "grass-floor" });
    expect(state.rows.get(scene.key)?.isEquipped).toBe(false);
    expect(state.rows.get(legacyFloor.key)?.isEquipped).toBe(true);
    expect(state.rows.get(accessory.key)?.isEquipped).toBe(true);
  });

  it("rejects food as a visual equipment item", async () => {
    installState();
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.category === "food")!;

    await expect(
      equipSlimeShopItem(student, "blue", cookie.key, true, "equip-food"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "invalid_body", status: 400 });
  });

  it("moves the same floor between slimes while preserving each slime's other floor", async () => {
    const state = installState();
    const grass = SLIME_SHOP_CATALOG.find((item) => item.floor === "grass-floor")!;
    const stone = SLIME_SHOP_CATALOG.find((item) => item.floor === "stone-floor")!;
    const snow = SLIME_SHOP_CATALOG.find((item) => item.floor === "snow-ground-floor")!;
    state.slimeRows[0].equippedItemKeys = [stone.key];
    state.slimeRows.push({
      id: "slime-2",
      studentId: student.id,
      color: "red",
      isRepresentative: false,
      equippedItemKeys: [grass.key, snow.key],
      hiddenItemKeys: [snow.key],
    });

    const result = await equipSlimeShopItem(student, "blue", snow.key, true, "move-floor");

    expect(result.equippedItemsByColor).toEqual({
      blue: [snow.key],
      red: [grass.key],
    });
    expect(result.equippedFloorByColor).toEqual({ blue: "snow-ground-floor", red: "grass-floor" });
    expect(state.slimeRows[1].equippedItemKeys).toEqual([grass.key]);
    expect(state.slimeRows[1].hiddenItemKeys).toEqual([]);
    expect(result.hiddenItemsByColor).toEqual({ blue: [], red: [] });
    expect(state.rows.get(grass.key)?.isEquipped).toBe(true);
  });

  it("hides only an equipped owned item without changing equipment or inventory state", async () => {
    const state = installState();
    state.slimeRows[0].equippedItemKeys = [background.key];
    state.rows.get(background.key)!.isEquipped = true;

    const result = await setSlimeShopItemHidden(
      student,
      "blue",
      background.key,
      true,
    );

    expect(result).toMatchObject({
      slimeColor: "blue",
      itemKey: background.key,
      isHidden: true,
      equippedItemKeys: [background.key],
      equippedItemsByColor: { blue: [background.key] },
      hiddenItemsByColor: { blue: [background.key] },
      idempotent: false,
    });
    expect(state.slimeRows[0].equippedItemKeys).toEqual([background.key]);
    expect(state.slimeRows[0].hiddenItemKeys).toEqual([background.key]);
    expect(state.rows.get(background.key)?.isEquipped).toBe(true);

    await expect(
      setSlimeShopItemHidden(student, "blue", background.key, true),
    ).resolves.toMatchObject({ idempotent: true });
  });

  it("rejects hiding an item that is not equipped", async () => {
    const state = installState();

    await expect(
      setSlimeShopItemHidden(student, "blue", background.key, true),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "invalid_body", status: 400 });
    expect(state.slimes.update).not.toHaveBeenCalled();
  });

  it("clears hidden state when the hidden item is unequipped", async () => {
    const state = installState();
    state.slimeRows[0].equippedItemKeys = [background.key];
    state.slimeRows[0].hiddenItemKeys = [background.key];

    const result = await equipSlimeShopItem(student, "blue", background.key, false, "hide-remove");

    expect(result.equippedItemKeys).toEqual([]);
    expect(result.hiddenItemsByColor).toEqual({ blue: [] });
    expect(state.slimeRows[0].hiddenItemKeys).toEqual([]);
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

  it("equips a trampoline purchased before its ride-to-vehicle reslot", async () => {
    const state = installState();
    const trampoline = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-blue-trampoline")!;
    state.rows.get(trampoline.key)!.itemKind = "slime-ride";

    await expect(
      equipSlimeShopItem(student, "blue", trampoline.key, true, "legacy-trampoline"),
    ).resolves.toMatchObject({
      itemKey: trampoline.key,
      isEquipped: true,
      equippedItemKeys: [trampoline.key],
    });
    expect(state.rows.get(trampoline.key)?.isEquipped).toBe(true);
  });
});
