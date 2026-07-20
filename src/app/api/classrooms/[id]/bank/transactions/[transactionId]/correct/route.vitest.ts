import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFind: vi.fn(),
  transactionFind: vi.fn(),
  accountUpdate: vi.fn(),
  accountUpdateMany: vi.fn(),
  accountFind: vi.fn(),
  transactionCreate: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    transaction: { findUnique: mocks.transactionFind },
    $transaction: mocks.dbTransaction,
  },
}));

import { POST } from "./route";

function request(reason = "잘못 지급") {
  return new Request("https://example.test/api/classrooms/class-1/bank/transactions/tx-1/correct", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

const params = { params: Promise.resolve({ id: "class-1", transactionId: "tx-1" }) };

describe("POST bank transaction correction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFind.mockResolvedValue({ teacherId: "teacher-1" });
    mocks.transactionFind
      .mockResolvedValueOnce({
        id: "tx-1",
        accountId: "account-1",
        type: "deposit",
        amount: 100,
        performedByKind: "teacher",
        account: { classroomId: "class-1" },
      })
      .mockResolvedValueOnce(null);
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 });
    mocks.accountFind.mockResolvedValue({ balance: 250 });
    mocks.transactionCreate.mockResolvedValue({ id: "correction-1" });
    mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        studentAccount: {
          update: mocks.accountUpdate,
          updateMany: mocks.accountUpdateMany,
          findUniqueOrThrow: mocks.accountFind,
        },
        transaction: { create: mocks.transactionCreate },
      }),
    );
  });

  it("appends an opposite ledger entry and updates the balance", async () => {
    const response = await POST(request(), params);

    expect(response.status).toBe(200);
    expect(mocks.accountUpdateMany).toHaveBeenCalledWith({
      where: { id: "account-1", balance: { gte: 100 } },
      data: { balance: { decrement: 100 } },
    });
    expect(mocks.transactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "correction_debit",
        amount: 100,
        balanceAfter: 250,
        sourceRef: "tx-1",
        performedByKind: "teacher",
      }),
      select: { id: true },
    });
  });

  it("allows only the classroom teacher and rejects duplicate corrections", async () => {
    mocks.classroomFind.mockResolvedValueOnce({ teacherId: "another-teacher" });
    expect((await POST(request(), params)).status).toBe(403);

    mocks.classroomFind.mockResolvedValueOnce({ teacherId: "teacher-1" });
    mocks.transactionFind.mockReset();
    mocks.transactionFind
      .mockResolvedValueOnce({
        id: "tx-1",
        accountId: "account-1",
        type: "withdraw",
        amount: 20,
        performedByKind: "banker",
        account: { classroomId: "class-1" },
      })
      .mockResolvedValueOnce({ id: "already-corrected" });
    expect((await POST(request(), params)).status).toBe(409);
  });

  it("rejects reward deposits and corrections that would make the balance negative", async () => {
    mocks.transactionFind.mockReset();
    mocks.transactionFind.mockResolvedValueOnce({
      id: "tx-1",
      accountId: "account-1",
      type: "deposit",
      amount: 100,
      performedByKind: "owner",
      account: { classroomId: "class-1" },
    });
    expect((await POST(request(), params)).status).toBe(400);

    mocks.transactionFind.mockReset();
    mocks.transactionFind
      .mockResolvedValueOnce({
        id: "tx-1",
        accountId: "account-1",
        type: "deposit",
        amount: 100,
        performedByKind: "teacher",
        account: { classroomId: "class-1" },
      })
      .mockResolvedValueOnce(null);
    mocks.accountUpdateMany.mockResolvedValueOnce({ count: 0 });
    const response = await POST(request(), params);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "현재 잔액이 부족해 이 입금 거래를 전액 정정할 수 없습니다",
    });
  });
});
