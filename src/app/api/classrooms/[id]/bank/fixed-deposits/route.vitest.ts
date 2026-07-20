import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  ensureAccountFor: vi.fn(),
  currencyFind: vi.fn(),
  accountUpdateMany: vi.fn(),
  accountFind: vi.fn(),
  fdCreate: vi.fn(),
  transactionCreate: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/bank", () => ({ ensureAccountFor: mocks.ensureAccountFor }));
vi.mock("@/lib/db", () => ({
  db: {
    classroomCurrency: { findUnique: mocks.currencyFind },
    $transaction: mocks.dbTransaction,
  },
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://example.test/api/classrooms/class-1/bank/fixed-deposits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "class-1" }) };

describe("POST fixed deposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "class-1" });
    mocks.currencyFind.mockResolvedValue({ monthlyInterestRate: 10 });
    mocks.ensureAccountFor.mockResolvedValue({ accountId: "account-1" });
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 });
    mocks.accountFind.mockResolvedValue({ id: "account-1", balance: 700 });
    mocks.fdCreate.mockResolvedValue({ id: "fd-1", principal: 300 });
    mocks.transactionCreate.mockResolvedValue({ id: "transaction-1" });
    mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        studentAccount: {
          updateMany: mocks.accountUpdateMany,
          findUniqueOrThrow: mocks.accountFind,
        },
        fixedDeposit: { create: mocks.fdCreate },
        transaction: { create: mocks.transactionCreate },
      }),
    );
  });

  it("lets the signed-in student open their own fixed deposit", async () => {
    const response = await POST(request({ principal: 300 }), context);

    expect(response.status).toBe(200);
    expect(mocks.accountUpdateMany).toHaveBeenCalledWith({
      where: { id: "account-1", balance: { gte: 300 } },
      data: { balance: { decrement: 300 } },
    });
    expect(mocks.fdCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: "account-1",
        principal: 300,
        openedById: "student-1",
        openedByKind: "owner",
      }),
    });
    expect(mocks.transactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "fd_open",
        performedById: "student-1",
        performedByKind: "owner",
      }),
    });
  });

  it("rejects non-students, cross-class access, and the old studentId contract", async () => {
    mocks.getCurrentStudent.mockResolvedValueOnce(null);
    expect((await POST(request({ principal: 300 }), context)).status).toBe(401);

    mocks.getCurrentStudent.mockResolvedValueOnce({ id: "student-1", classroomId: "class-2" });
    expect((await POST(request({ principal: 300 }), context)).status).toBe(403);

    expect(
      (await POST(request({ studentId: "student-2", principal: 300 }), context)).status,
    ).toBe(400);

    const crossOriginRequest = request({ principal: 300 });
    crossOriginRequest.headers.set("origin", "https://malicious.example");
    expect((await POST(crossOriginRequest, context)).status).toBe(403);
  });

  it("does not overdraw when the balance changed concurrently", async () => {
    mocks.accountUpdateMany.mockResolvedValueOnce({ count: 0 });
    const response = await POST(request({ principal: 300 }), context);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "잔액 부족" });
    expect(mocks.fdCreate).not.toHaveBeenCalled();
  });
});
