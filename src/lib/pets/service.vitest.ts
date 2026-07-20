import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  accountFind: vi.fn(),
  accountUpdateMany: vi.fn(),
  currencyFind: vi.fn(),
  slimeFindMany: vi.fn(),
  slimeFindUnique: vi.fn(),
  slimeCreate: vi.fn(),
  ledgerFind: vi.fn(),
  ledgerCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    studentAccount: { findUnique: mocks.accountFind },
    classroomCurrency: { findUnique: mocks.currencyFind },
    studentSlime: {
      findMany: mocks.slimeFindMany,
      findUnique: mocks.slimeFindUnique,
    },
    transaction: { findFirst: mocks.ledgerFind },
  },
}));

import {
  getSlimeHome,
  purchaseSlime,
  SlimeServiceError,
  slimePurchaseSourceRef,
} from "./service";

const student = { id: "student-1", classroomId: "classroom-1" };

function installPurchaseState(startingBalance = 600) {
  let balance = startingBalance;
  const owned = new Map<string, { id: string; color: string }>();
  const ledger = new Map<
    string,
    { id: string; accountId: string; balanceAfter: number; note: string; slimePurchase: { color: string } | null }
  >();
  let pendingTransactionId = "";

  mocks.accountFind.mockImplementation(async ({ where }: { where: { studentId?: string; id?: string } }) =>
    where.studentId === student.id || where.id === "account-1"
      ? { id: "account-1", balance }
      : null,
  );
  mocks.slimeFindUnique.mockImplementation(async ({ where }: { where: { studentId_color?: { color: string } } }) => {
    const color = where.studentId_color?.color;
    return color ? owned.get(color) ?? null : null;
  });
  mocks.ledgerFind.mockImplementation(async ({ where }: { where: { sourceRef: string } }) =>
    ledger.get(where.sourceRef) ?? null,
  );
  mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    const snapshotBalance = balance;
    const snapshotOwned = new Map(owned);
    const snapshotLedger = new Map(ledger);
    const tx = {
      studentAccount: {
        updateMany: mocks.accountUpdateMany.mockImplementation(async ({ where }: { where: { balance: { gte: number } } }) => {
          if (balance < where.balance.gte) return { count: 0 };
          balance -= where.balance.gte;
          return { count: 1 };
        }),
        findUnique: mocks.accountFind,
      },
      studentSlime: {
        findUnique: mocks.slimeFindUnique,
        create: mocks.slimeCreate.mockImplementation(async ({ data }: { data: { color: string; purchaseTransactionId: string } }) => {
          const row = { id: `slime-${data.color}`, color: data.color };
          owned.set(data.color, row);
          const transaction = [...ledger.values()].find((entry) => entry.id === data.purchaseTransactionId);
          if (transaction) transaction.slimePurchase = { color: data.color };
          return row;
        }),
      },
      transaction: {
        findFirst: mocks.ledgerFind,
        create: mocks.ledgerCreate.mockImplementation(async ({ data }: { data: { sourceRef: string; balanceAfter: number; note: string } }) => {
          pendingTransactionId = `transaction-${ledger.size + 1}`;
          const row = {
            id: pendingTransactionId,
            accountId: "account-1",
            balanceAfter: data.balanceAfter,
            note: data.note,
            slimePurchase: null,
          };
          ledger.set(data.sourceRef, row);
          return row;
        }),
      },
    };
    try {
      return await operation(tx);
    } catch (error) {
      balance = snapshotBalance;
      owned.clear();
      snapshotOwned.forEach((value, key) => owned.set(key, value));
      ledger.clear();
      snapshotLedger.forEach((value, key) => ledger.set(key, value));
      throw error;
    }
  });
  return { get balance() { return balance; }, owned, ledger, get pendingTransactionId() { return pendingTransactionId; } };
}

describe("slime wallet service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currencyFind.mockResolvedValue({ unitLabel: "별" });
    mocks.slimeFindMany.mockResolvedValue([]);
  });

  it("returns wallet balance, currency fallback, owned colors, and catalog", async () => {
    mocks.accountFind.mockResolvedValue({ balance: 320 });
    mocks.currencyFind.mockResolvedValue(null);
    mocks.slimeFindMany.mockResolvedValue([{ color: "red" }, { color: "blue" }]);

    const home = await getSlimeHome(student);

    expect(home.balance).toBe(320);
    expect(home.currency.unitLabel).toBe("원");
    expect(home.ownedColors).toEqual(["blue", "red"]);
    expect(home.catalog).toHaveLength(5);
    expect(mocks.slimeFindMany).toHaveBeenCalledWith({
      where: { studentId: student.id },
      select: { color: true, isEquipped: true, equippedItemKeys: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("debits the guarded balance and creates ledger and ownership atomically", async () => {
    const state = installPurchaseState();

    const result = await purchaseSlime(student, "blue", "attempt-1");

    expect(result).toEqual({ ownedColor: "blue", balance: 100, idempotent: false });
    expect(state.balance).toBe(100);
    expect(state.owned.get("blue")).toBeTruthy();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "slime_purchase",
        amount: 500,
        sourceRef: "student-1:attempt-1",
      }),
    });
  });

  it("replays the same key and color without a second debit", async () => {
    const state = installPurchaseState();
    await purchaseSlime(student, "green", "same-attempt");

    const replay = await purchaseSlime(student, "green", "same-attempt");

    expect(replay).toEqual({ ownedColor: "green", balance: 100, idempotent: true });
    expect(state.balance).toBe(100);
    expect(mocks.accountUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a key reused for another color", async () => {
    installPurchaseState();
    await purchaseSlime(student, "blue", "same-attempt");

    await expect(purchaseSlime(student, "red", "same-attempt")).rejects.toMatchObject({
      code: "idempotency_key_reused",
      status: 409,
    });
  });

  it("rejects already-owned and insufficient-funds purchases without a debit", async () => {
    const ownedState = installPurchaseState();
    ownedState.owned.set("purple", { id: "owned-purple", color: "purple" });
    await expect(purchaseSlime(student, "purple", "new-attempt")).rejects.toMatchObject({
      code: "already_owned",
      status: 409,
    });

    const poorState = installPurchaseState(499);
    await expect(purchaseSlime(student, "yellow", "poor-attempt")).rejects.toMatchObject({
      code: "insufficient_funds",
      status: 402,
    });
    expect(poorState.balance).toBe(499);
    expect(poorState.owned.size).toBe(0);
  });

  it("reports a missing account and scopes idempotency keys by student", async () => {
    mocks.accountFind.mockResolvedValue(null);
    mocks.ledgerFind.mockResolvedValue(null);

    await expect(purchaseSlime(student, "blue", "attempt")).rejects.toEqual(
      expect.objectContaining<Partial<SlimeServiceError>>({ code: "account_not_found", status: 404 }),
    );
    expect(slimePurchaseSourceRef("student-1", "key")).not.toBe(
      slimePurchaseSourceRef("student-2", "key"),
    );
  });
});
