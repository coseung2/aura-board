import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  accountFind: vi.fn(),
  accountUpdateMany: vi.fn(),
  currencyFind: vi.fn(),
  slimeFindMany: vi.fn(),
  inventoryFind: vi.fn(),
  inventoryFindMany: vi.fn(),
  inventoryCreate: vi.fn(),
  inventoryUpdate: vi.fn(),
  ledgerFind: vi.fn(),
  ledgerCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    studentAccount: { findUnique: mocks.accountFind, updateMany: mocks.accountUpdateMany },
    classroomCurrency: { findUnique: mocks.currencyFind },
    studentSlime: { findMany: mocks.slimeFindMany },
    studentCreatureItem: {
      findMany: mocks.inventoryFindMany,
      findUnique: mocks.inventoryFind,
      create: mocks.inventoryCreate,
      update: mocks.inventoryUpdate,
    },
    transaction: { findFirst: mocks.ledgerFind, create: mocks.ledgerCreate },
  },
}));

import {
  getSlimeHome,
  purchaseSlimeShopItem,
  SlimeServiceError,
} from "./service";
import { SLIME_SHOP_CATALOG } from "./catalog";

const student = { id: "student-1", classroomId: "classroom-1" };

function installState(startingBalance = 100) {
  let balance = startingBalance;
  const inventory = new Map<string, { id: string; itemKey: string; quantity: number }>();
  const ledger = new Map<string, { id: string; accountId: string; balanceAfter: number; note: string }>();

  const readInventory = (itemKey: string) => inventory.get(itemKey) ?? null;
  mocks.accountFind.mockImplementation(async ({ where }: { where: { studentId?: string; id?: string } }) =>
    where.studentId === student.id || where.id === "account-1"
      ? { id: "account-1", balance }
      : null,
  );
  mocks.inventoryFind.mockImplementation(async ({ where }: { where: { studentId_itemKey: { itemKey: string } } }) =>
    readInventory(where.studentId_itemKey.itemKey),
  );
  mocks.inventoryFindMany.mockImplementation(async () => [...inventory.values()]);
  mocks.ledgerFind.mockImplementation(async ({ where }: { where: { sourceRef: string } }) =>
    ledger.get(where.sourceRef) ?? null,
  );
  mocks.accountUpdateMany.mockImplementation(async ({ where }: { where: { balance: { gte: number } } }) => {
    if (balance < where.balance.gte) return { count: 0 };
    balance -= where.balance.gte;
    return { count: 1 };
  });
  mocks.ledgerCreate.mockImplementation(async ({ data }: { data: { sourceRef: string; balanceAfter: number; note: string } }) => {
    const row = { id: `transaction-${ledger.size + 1}`, accountId: "account-1", balanceAfter: data.balanceAfter, note: data.note };
    ledger.set(data.sourceRef, row);
    return row;
  });
  mocks.inventoryCreate.mockImplementation(async ({ data }: { data: { itemKey: string; quantity: number } }) => {
    const row = { id: `inventory-${data.itemKey}`, itemKey: data.itemKey, quantity: data.quantity };
    inventory.set(data.itemKey, row);
    return row;
  });
  mocks.inventoryUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { quantity: number } }) => {
    const row = [...inventory.values()].find((entry) => entry.id === where.id);
    if (!row) return null;
    row.quantity = data.quantity;
    return row;
  });
  mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
    operation({
      studentAccount: { findUnique: mocks.accountFind, updateMany: mocks.accountUpdateMany },
      studentCreatureItem: {
        findUnique: mocks.inventoryFind,
        create: mocks.inventoryCreate,
        update: mocks.inventoryUpdate,
      },
      transaction: { findFirst: mocks.ledgerFind, create: mocks.ledgerCreate },
    }),
  );

  return {
    get balance() {
      return balance;
    },
    inventory,
    ledger,
  };
}

describe("slime shop service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currencyFind.mockResolvedValue({ unitLabel: "원" });
    mocks.slimeFindMany.mockResolvedValue([]);
  });

  it("includes shop catalog and owned item keys in the home snapshot", async () => {
    mocks.accountFind.mockResolvedValue({ balance: 320 });
    mocks.inventoryFindMany.mockResolvedValue([
      { itemKey: SLIME_SHOP_CATALOG[0].key },
      { itemKey: "not-a-shop-item" },
    ]);

    const home = await getSlimeHome(student);

    expect(home.shopCatalog).toHaveLength(4);
    expect(home.ownedItemKeys).toEqual([SLIME_SHOP_CATALOG[0].key]);
    expect(home.equippedFloorByColor).toEqual({});
    expect(home.equippedFloor).toBe("none");
  });

  it("derives representative floor state with last-equipped-key precedence", async () => {
    mocks.accountFind.mockResolvedValue({ balance: 320 });
    mocks.slimeFindMany
      .mockResolvedValueOnce([
        {
          color: "blue",
          isEquipped: true,
          isRepresentative: true,
          equippedItemKeys: ["slime-blue-trampoline", "water-puddle-background"],
        },
        {
          color: "red",
          isEquipped: true,
          isRepresentative: false,
          equippedItemKeys: ["slime-blue-drink-lemonade"],
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.inventoryFindMany.mockResolvedValue([]);

    const home = await getSlimeHome(student);

    expect(home.equippedFloorByColor).toEqual({ blue: "water-puddle", red: "none" });
    expect(home.equippedFloor).toBe("water-puddle");
  });

  it("debits once, records source linkage, creates inventory, and replays", async () => {
    const state = installState();
    const item = SLIME_SHOP_CATALOG[0];

    const result = await purchaseSlimeShopItem(student, item.key, "shop-attempt");
    expect(result).toEqual({ ownedItemKey: item.key, balance: 70, idempotent: false });
    expect(state.inventory.get(item.key)).toMatchObject({ quantity: 1 });
    expect(mocks.ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "slime_item_purchase",
        sourceType: "slime_item_purchase",
        sourceRef: "student-1:shop-attempt",
        amount: 30,
      }),
    });

    const replay = await purchaseSlimeShopItem(student, item.key, "shop-attempt");
    expect(replay).toEqual({ ownedItemKey: item.key, balance: 70, idempotent: true });
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects already owned, insufficient funds, and mismatched idempotency keys", async () => {
    const owned = installState();
    owned.inventory.set(SLIME_SHOP_CATALOG[0].key, {
      id: "owned-item",
      itemKey: SLIME_SHOP_CATALOG[0].key,
      quantity: 1,
    });
    await expect(
      purchaseSlimeShopItem(student, SLIME_SHOP_CATALOG[0].key, "new-key"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "already_owned", status: 409 });

    const poor = installState(29);
    await expect(
      purchaseSlimeShopItem(student, SLIME_SHOP_CATALOG[1].key, "poor-key"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "insufficient_funds", status: 402 });
    expect(poor.balance).toBe(29);

    const reused = installState();
    await purchaseSlimeShopItem(student, SLIME_SHOP_CATALOG[0].key, "same-key");
    await expect(
      purchaseSlimeShopItem(student, SLIME_SHOP_CATALOG[1].key, "same-key"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({
      code: "idempotency_key_reused",
      status: 409,
    });
    expect(reused.balance).toBe(70);
  });
});
