import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudent: vi.fn(),
  hasPermission: vi.fn(),
  getCardIdFromToken: vi.fn(),
  verifyCardToken: vi.fn(),
  cardFind: vi.fn(),
  itemsFind: vi.fn(),
  accountUpdateMany: vi.fn(),
  accountFind: vi.fn(),
  itemUpdateMany: vi.fn(),
  transactionCreate: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/bank-permissions", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("@/lib/qr-token", () => ({
  getCardIdFromToken: mocks.getCardIdFromToken,
  verifyCardToken: mocks.verifyCardToken,
}));
vi.mock("@/lib/db", () => ({
  db: {
    studentCard: { findUnique: mocks.cardFind },
    storeItem: { findMany: mocks.itemsFind },
    $transaction: mocks.dbTransaction,
  },
}));

import { POST } from "./route";

function request(qty = 1) {
  return new Request("https://example.test/api/classrooms/class-1/store/charge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cardQrToken: "card-token",
      items: [{ itemId: "item-1", qty }],
    }),
  });
}

const context = { params: Promise.resolve({ id: "class-1" }) };
const tx = {
  studentAccount: {
    updateMany: mocks.accountUpdateMany,
    findUniqueOrThrow: mocks.accountFind,
  },
  storeItem: { updateMany: mocks.itemUpdateMany },
  transaction: { create: mocks.transactionCreate },
};

describe("POST store charge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getCurrentStudent.mockResolvedValue(null);
    mocks.hasPermission.mockResolvedValue(true);
    mocks.getCardIdFromToken.mockReturnValue("card-1");
    mocks.verifyCardToken.mockReturnValue(true);
    mocks.cardFind.mockResolvedValue({
      id: "card-1",
      status: "active",
      qrSecret: "secret",
      accountId: "account-1",
      account: {
        classroomId: "class-1",
        student: { id: "student-1", name: "Student", number: 1 },
      },
    });
    mocks.itemsFind.mockResolvedValue([
      { id: "item-1", classroomId: "class-1", name: "Pencil", price: 100, stock: 1 },
    ]);
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 });
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.accountFind.mockResolvedValue({ id: "account-1", balance: 900 });
    mocks.transactionCreate.mockResolvedValue({ id: "transaction-1" });
    mocks.dbTransaction.mockImplementation(
      async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    );
  });

  it("guards both balance and stock before creating the purchase ledger", async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.accountUpdateMany).toHaveBeenCalledWith({
      where: { id: "account-1", balance: { gte: 100 } },
      data: { balance: { decrement: 100 } },
    });
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "item-1",
        classroomId: "class-1",
        archived: false,
        stock: { gte: 1 },
      },
      data: { stock: { decrement: 1 } },
    });
    expect(mocks.transactionCreate).toHaveBeenCalledOnce();
  });

  it("returns a conflict and creates no ledger when guarded stock decrement fails", async () => {
    mocks.itemUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Pencil 재고 부족",
    });
    expect(mocks.accountFind).not.toHaveBeenCalled();
    expect(mocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("does not touch stock or the ledger when the guarded balance debit fails", async () => {
    mocks.accountUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "잔액 부족" });
    expect(mocks.itemUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("allows only one of two concurrent purchases for the final stock unit", async () => {
    let balance = 1_000;
    let stock = 1;
    let ledgerWrites = 0;
    let queue = Promise.resolve();
    const statefulTx = {
      studentAccount: {
        updateMany: vi.fn(async ({ where }: { where: { balance: { gte: number } } }) => {
          if (balance < where.balance.gte) return { count: 0 };
          balance -= where.balance.gte;
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => ({ id: "account-1", balance })),
      },
      storeItem: {
        updateMany: vi.fn(async ({ where }: { where: { stock: { gte: number } } }) => {
          if (stock < where.stock.gte) return { count: 0 };
          stock -= where.stock.gte;
          return { count: 1 };
        }),
      },
      transaction: {
        create: vi.fn(async () => ({ id: `transaction-${++ledgerWrites}` })),
      },
    };
    mocks.dbTransaction.mockImplementation((operation: (client: typeof statefulTx) => Promise<unknown>) => {
      const run = queue.then(async () => {
        const snapshot = { balance, stock, ledgerWrites };
        try {
          return await operation(statefulTx);
        } catch (error) {
          ({ balance, stock, ledgerWrites } = snapshot);
          throw error;
        }
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    });

    const responses = await Promise.all([
      POST(request(), context),
      POST(request(), context),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(balance).toBe(900);
    expect(stock).toBe(0);
    expect(ledgerWrites).toBe(1);
  });

  it("rolls balance and stock back when purchase ledger creation fails", async () => {
    let balance = 1_000;
    let stock = 1;
    mocks.dbTransaction.mockImplementation(async (operation: (client: typeof tx) => Promise<unknown>) => {
      const snapshot = { balance, stock };
      const rollbackTx = {
        studentAccount: {
          updateMany: vi.fn(async () => {
            balance -= 100;
            return { count: 1 };
          }),
          findUniqueOrThrow: vi.fn(async () => ({ id: "account-1", balance })),
        },
        storeItem: {
          updateMany: vi.fn(async () => {
            stock -= 1;
            return { count: 1 };
          }),
        },
        transaction: { create: vi.fn(async () => { throw new Error("ledger_failed"); }) },
      };
      try {
        return await operation(rollbackTx as typeof tx);
      } catch (error) {
        ({ balance, stock } = snapshot);
        throw error;
      }
    });

    await expect(POST(request(), context)).rejects.toThrow("ledger_failed");
    expect({ balance, stock }).toEqual({ balance: 1_000, stock: 1 });
  });
});
