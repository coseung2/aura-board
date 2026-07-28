import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudent: vi.fn(),
  hasPermission: vi.fn(),
  ensureAccountFor: vi.fn(),
  studentFind: vi.fn(),
  accountUpdateMany: vi.fn(),
  accountFind: vi.fn(),
  transactionCreate: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/bank-permissions", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("@/lib/bank", () => ({ ensureAccountFor: mocks.ensureAccountFor }));
vi.mock("@/lib/db", () => ({
  db: {
    student: { findUnique: mocks.studentFind },
    $transaction: mocks.dbTransaction,
  },
}));

import { POST } from "./route";

function request(amount = 300) {
  return new Request("https://example.test/api/classrooms/class-1/bank/withdraw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId: "student-1", amount, note: "cash" }),
  });
}

const context = { params: Promise.resolve({ id: "class-1" }) };
const tx = {
  studentAccount: {
    updateMany: mocks.accountUpdateMany,
    findUniqueOrThrow: mocks.accountFind,
  },
  transaction: { create: mocks.transactionCreate },
};

describe("POST bank withdrawal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getCurrentStudent.mockResolvedValue(null);
    mocks.hasPermission.mockResolvedValue(true);
    mocks.studentFind.mockResolvedValue({ id: "student-1", classroomId: "class-1" });
    mocks.ensureAccountFor.mockResolvedValue({ accountId: "account-1" });
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 });
    mocks.accountFind.mockResolvedValue({ id: "account-1", balance: 700 });
    mocks.transactionCreate.mockResolvedValue({ id: "transaction-1" });
    mocks.dbTransaction.mockImplementation(
      async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    );
  });

  it("guards the debit and creates the ledger entry only after it succeeds", async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      balance: 700,
      transactionId: "transaction-1",
    });
    expect(mocks.accountUpdateMany).toHaveBeenCalledWith({
      where: { id: "account-1", balance: { gte: 300 } },
      data: { balance: { decrement: 300 } },
    });
    expect(mocks.transactionCreate).toHaveBeenCalledOnce();
  });

  it("returns a conflict and writes no ledger when the guarded debit loses a race", async () => {
    mocks.accountUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "잔액 부족" });
    expect(mocks.accountFind).not.toHaveBeenCalled();
    expect(mocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("allows only one of two concurrent withdrawals against the same balance", async () => {
    let balance = 500;
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
      transaction: {
        create: vi.fn(async () => ({ id: `transaction-${++ledgerWrites}` })),
      },
    };
    mocks.dbTransaction.mockImplementation((operation: (client: typeof statefulTx) => Promise<unknown>) => {
      const run = queue.then(() => operation(statefulTx));
      queue = run.then(() => undefined, () => undefined);
      return run;
    });

    const responses = await Promise.all([
      POST(request(400), context),
      POST(request(400), context),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(balance).toBe(100);
    expect(ledgerWrites).toBe(1);
  });

  it("rolls the debit back when ledger creation fails", async () => {
    let balance = 500;
    mocks.dbTransaction.mockImplementation(async (operation: (client: typeof tx) => Promise<unknown>) => {
      const snapshot = balance;
      const rollbackTx = {
        studentAccount: {
          updateMany: vi.fn(async () => {
            balance -= 300;
            return { count: 1 };
          }),
          findUniqueOrThrow: vi.fn(async () => ({ id: "account-1", balance })),
        },
        transaction: { create: vi.fn(async () => { throw new Error("ledger_failed"); }) },
      };
      try {
        return await operation(rollbackTx as typeof tx);
      } catch (error) {
        balance = snapshot;
        throw error;
      }
    });

    await expect(POST(request(), context)).rejects.toThrow("ledger_failed");
    expect(balance).toBe(500);
  });
});
