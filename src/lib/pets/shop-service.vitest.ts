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
  refundSlimeShopItem,
  SlimeServiceError,
} from "./service";
import { SLIME_SHOP_CATALOG } from "./catalog";

const student = { id: "student-1", classroomId: "classroom-1" };

function installState(startingBalance = 100) {
  let balance = startingBalance;
  const inventory = new Map<string, { id: string; itemKey: string; quantity: number }>();
  const ledger = new Map<
    string,
    { id: string; accountId: string; balanceAfter: number; note: string; amount: number }
  >();

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
  mocks.ledgerCreate.mockImplementation(async ({ data }: { data: { sourceRef: string; balanceAfter: number; note: string; amount: number } }) => {
    // `amount` is part of the real row and the replay guard compares it, so the
    // fake ledger has to persist it too.
    const row = {
      id: `transaction-${ledger.size + 1}`,
      accountId: "account-1",
      balanceAfter: data.balanceAfter,
      note: data.note,
      amount: data.amount,
    };
    ledger.set(data.sourceRef, row);
    return row;
  });
  mocks.inventoryCreate.mockImplementation(async ({ data }: { data: { itemKey: string; quantity: number } }) => {
    const row = { id: `inventory-${data.itemKey}`, itemKey: data.itemKey, quantity: data.quantity };
    inventory.set(data.itemKey, row);
    return row;
  });
  mocks.inventoryUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { quantity: number | { increment: number } } }) => {
    const row = [...inventory.values()].find((entry) => entry.id === where.id);
    if (!row) return null;
    row.quantity = typeof data.quantity === "number"
      ? data.quantity
      : row.quantity + data.quantity.increment;
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

    expect(home.shopCatalog).toHaveLength(SLIME_SHOP_CATALOG.length);
    expect(home.ownedItemKeys).toEqual([SLIME_SHOP_CATALOG[0].key]);
    expect(home.ownedItemQuantities).toEqual({ [SLIME_SHOP_CATALOG[0].key]: 1 });
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
          // The trampoline is a vehicle now and carries no floor state, so the
          // floor comes from the last real floor key.
          equippedItemKeys: ["slime-blue-trampoline", "stone-floor"],
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

    expect(home.equippedFloorByColor).toEqual({ blue: "stone-floor", red: "none" });
    expect(home.equippedFloor).toBe("stone-floor");
  });

  it("debits once, records source linkage, creates inventory, and replays", async () => {
    const item = SLIME_SHOP_CATALOG[0];
    const state = installState(item.price);

    const result = await purchaseSlimeShopItem(student, item.key, "shop-attempt");
    expect(result).toEqual({ ownedItemKey: item.key, balance: 0, idempotent: false });
    expect(state.inventory.get(item.key)).toMatchObject({ quantity: 1 });
    expect(mocks.ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "slime_item_purchase",
        sourceType: "slime_item_purchase",
        sourceRef: "student-1:shop-attempt",
        amount: item.price,
      }),
    });

    const replay = await purchaseSlimeShopItem(student, item.key, "shop-attempt");
    expect(replay).toEqual({ ownedItemKey: item.key, balance: 0, idempotent: true });
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

    const poorItem = SLIME_SHOP_CATALOG[1];
    const poor = installState(poorItem.price - 1);
    await expect(
      purchaseSlimeShopItem(student, poorItem.key, "poor-key"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "insufficient_funds", status: 402 });
    expect(poor.balance).toBe(poorItem.price - 1);

    const reused = installState(SLIME_SHOP_CATALOG[0].price);
    await purchaseSlimeShopItem(student, SLIME_SHOP_CATALOG[0].key, "same-key");
    await expect(
      purchaseSlimeShopItem(student, SLIME_SHOP_CATALOG[1].key, "same-key"),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({
      code: "idempotency_key_reused",
      status: 409,
    });
    expect(reused.balance).toBe(0);
  });

  it("allows repeatable cookie purchases and keeps each idempotency key single-charge", async () => {
    const state = installState(100);
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-cookie");
    if (!cookie) throw new Error("cookie catalog item missing");

    await purchaseSlimeShopItem(student, cookie.key, "cookie-1");
    await purchaseSlimeShopItem(student, cookie.key, "cookie-2");
    const replay = await purchaseSlimeShopItem(student, cookie.key, "cookie-2");

    expect(state.balance).toBe(40);
    expect(state.inventory.get(cookie.key)?.quantity).toBe(2);
    expect(replay).toEqual({ ownedItemKey: cookie.key, balance: 40, idempotent: true });
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("charges consumables per unit and stacks the purchased quantity", async () => {
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-cookie");
    if (!cookie) throw new Error("cookie catalog item missing");
    const state = installState(cookie.price * 5);

    const result = await purchaseSlimeShopItem(student, cookie.key, "cookie-bulk", 3);

    expect(result).toMatchObject({ ownedItemKey: cookie.key, idempotent: false });
    expect(state.balance).toBe(cookie.price * 2);
    expect(state.inventory.get(cookie.key)?.quantity).toBe(3);
    expect(mocks.ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: cookie.price * 3 }),
    });
  });

  it("rejects a quantity replay that does not match the original charge", async () => {
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-cookie");
    if (!cookie) throw new Error("cookie catalog item missing");
    const state = installState(cookie.price * 10);

    await purchaseSlimeShopItem(student, cookie.key, "cookie-mismatch", 2);
    // Reusing a key with a different quantity is a different request, so it must
    // not report success while silently keeping the original charge.
    await expect(
      purchaseSlimeShopItem(student, cookie.key, "cookie-mismatch", 5),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({
      code: "idempotency_key_reused",
      status: 409,
    });
    expect(state.inventory.get(cookie.key)?.quantity).toBe(2);

    const replay = await purchaseSlimeShopItem(student, cookie.key, "cookie-mismatch", 2);
    expect(replay).toMatchObject({ idempotent: true });
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a quantity mismatch found inside the transaction, not just before it", async () => {
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-cookie");
    if (!cookie) throw new Error("cookie catalog item missing");
    const state = installState(cookie.price * 10);

    await purchaseSlimeShopItem(student, cookie.key, "cookie-race", 2);

    // Simulate the race the pre-transaction replay cannot see: the row exists by
    // the time the transaction runs, but the outer lookup missed it.
    const realFind = mocks.ledgerFind.getMockImplementation()!;
    mocks.ledgerFind.mockImplementationOnce(async () => null);

    await expect(
      purchaseSlimeShopItem(student, cookie.key, "cookie-race", 5),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({
      code: "idempotency_key_reused",
      status: 409,
    });
    mocks.ledgerFind.mockImplementation(realFind);
    expect(state.inventory.get(cookie.key)?.quantity).toBe(2);
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses quantity on items that are owned once per student", async () => {
    const cosmetic = SLIME_SHOP_CATALOG[0];
    installState(cosmetic.price * 5);

    await expect(
      purchaseSlimeShopItem(student, cosmetic.key, "cosmetic-bulk", 2),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({
      code: "invalid_body",
      status: 400,
    });
  });

  it("rejects non-positive, fractional, and oversized quantities", async () => {
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-cookie");
    if (!cookie) throw new Error("cookie catalog item missing");

    for (const quantity of [0, -1, 1.5, 100]) {
      installState(cookie.price * 200);
      await expect(
        purchaseSlimeShopItem(student, cookie.key, `bad-${quantity}`, quantity),
      ).rejects.toMatchObject<Partial<SlimeServiceError>>({
        code: "invalid_body",
        status: 400,
      });
    }
  });

  it("never refunds a consumable, since inventory cannot tell spent units apart", async () => {
    const cookie = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-cookie");
    if (!cookie) throw new Error("cookie catalog item missing");
    const state = installState(cookie.price * 5);
    await purchaseSlimeShopItem(student, cookie.key, "cookie-refund", 3);
    const balanceAfterPurchase = state.balance;

    await expect(
      refundSlimeShopItem(student, cookie.key),
    ).rejects.toMatchObject<Partial<SlimeServiceError>>({ code: "not_refundable" });
    expect(state.balance).toBe(balanceAfterPurchase);
    expect(state.inventory.get(cookie.key)?.quantity).toBe(3);
  });
});
