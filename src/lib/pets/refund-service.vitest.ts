import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { SLIME_SHOP_CATALOG } from "./catalog";
import {
  refundSlime,
  refundSlimeShopItem,
  SLIME_ITEM_PURCHASE_SOURCE_TYPE,
  SLIME_ITEM_REFUND_SOURCE_TYPE,
  SLIME_PURCHASE_SOURCE_TYPE,
  SLIME_REFUND_SOURCE_TYPE,
} from "./service";

const student = { id: "student-1", classroomId: "classroom-1" };

describe("student slime shop refunds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refunds the original slime payment and reassigns the representative", async () => {
    const createTransaction = vi.fn(async () => ({ id: "refund-1" }));
    const deleteSlime = vi.fn(async () => ({ id: "slime-blue" }));
    const updateSlime = vi.fn(async () => ({ id: "slime-green" }));
    const tx = {
      studentSlime: {
        findUnique: vi.fn(async () => ({
          id: "slime-blue",
          isRepresentative: true,
          purchaseTransaction: {
            id: "purchase-1",
            amount: 500,
            accountId: "account-1",
            type: SLIME_PURCHASE_SOURCE_TYPE,
            sourceType: SLIME_PURCHASE_SOURCE_TYPE,
            account: { studentId: student.id },
          },
        })),
        delete: deleteSlime,
        findFirst: vi.fn(async () => ({ id: "slime-green", color: "green" })),
        update: updateSlime,
      },
      transaction: { findFirst: vi.fn(async () => null), create: createTransaction },
      studentAccount: { update: vi.fn(async () => ({ balance: 850 })) },
    };
    mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));

    await expect(refundSlime(student, "blue")).resolves.toEqual({
      refundedColor: "blue",
      balance: 850,
      representativeColor: "green",
    });
    expect(createTransaction).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "refund",
        amount: 500,
        sourceType: SLIME_REFUND_SOURCE_TYPE,
        sourceRef: "purchase-1",
      }),
    });
    expect(deleteSlime).toHaveBeenCalledWith({ where: { id: "slime-blue" } });
    expect(updateSlime).toHaveBeenCalledWith({
      where: { id: "slime-green" },
      data: { isRepresentative: true },
    });
  });

  it("refunds an owned cosmetic and removes it from every slime", async () => {
    const item = SLIME_SHOP_CATALOG[0];
    const slimeRows = [
      { id: "slime-blue", equippedItemKeys: [item.key, "another-item"] },
      { id: "slime-purple", equippedItemKeys: [item.key] },
    ];
    const updateInventory = vi.fn(async () => ({ id: "inventory-1" }));
    const updateSlime = vi.fn(async () => ({}));
    const createTransaction = vi.fn(async () => ({ id: "refund-1" }));
    const purchase = {
      id: "purchase-item-1",
      amount: 30,
      accountId: "account-1",
      type: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
      sourceType: SLIME_ITEM_PURCHASE_SOURCE_TYPE,
      account: { studentId: student.id },
    };
    const tx = {
      studentCreatureItem: {
        findUnique: vi.fn(async () => ({
          id: "inventory-1",
          quantity: 1,
          itemKind: `slime-${item.category}`,
          // Purchases made before the refund feature have no direct relation.
          purchaseTransaction: null,
        })),
        update: updateInventory,
      },
      studentSlime: {
        findMany: vi.fn(async () => slimeRows),
        update: updateSlime,
      },
      transaction: {
        findFirst: vi.fn(async ({ where }: { where: { sourceType?: string } }) =>
          where.sourceType === SLIME_ITEM_PURCHASE_SOURCE_TYPE ? purchase : null,
        ),
        create: createTransaction,
      },
      studentAccount: { update: vi.fn(async () => ({ balance: 380 })) },
    };
    mocks.transaction.mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));

    await expect(refundSlimeShopItem(student, item.key)).resolves.toEqual({
      refundedItemKey: item.key,
      balance: 380,
    });
    expect(updateInventory).toHaveBeenCalledWith({
      where: { id: "inventory-1" },
      data: {
        quantity: 0,
        isEquipped: false,
        purchaseTransactionId: "purchase-item-1",
      },
    });
    expect(createTransaction).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "refund",
        amount: 30,
        sourceType: SLIME_ITEM_REFUND_SOURCE_TYPE,
        sourceRef: "purchase-item-1",
      }),
    });
    expect(updateSlime).toHaveBeenNthCalledWith(1, {
      where: { id: "slime-blue" },
      data: { equippedItemKeys: ["another-item"] },
    });
    expect(updateSlime).toHaveBeenNthCalledWith(2, {
      where: { id: "slime-purple" },
      data: { equippedItemKeys: [] },
    });
  });
});
