import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFind: vi.fn(),
  committedLedgerFind: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/qr-token", () => ({
  generateCardNumber: vi.fn(() => "5501-0001"),
  generateCardSecret: vi.fn(() => "card-secret"),
}));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFind },
    transaction: { findFirst: mocks.committedLedgerFind },
    $transaction: mocks.dbTransaction,
  },
}));

import { POST } from "./route";

type Account = { id: string; studentId: string; classroomId: string; balance: number };
type Ledger = {
  id: string;
  accountId: string;
  amount: number;
  balanceAfter: number;
  sourceType: string;
  sourceRef: string;
};

const context = { params: Promise.resolve({ id: "class-1" }) };
const accounts = new Map<string, Account>();
const cards = new Map<string, { id: string; accountId: string }>();
const ledger = new Map<string, Ledger>();
let failLedgerWrite = 0;

function request(requestKey: string | null = "salary-request-001") {
  return new Request("https://example.test/api/classrooms/class-1/roles/pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleKey: "helper", ...(requestKey ? { requestKey } : {}) }),
  });
}

/** roleKey 없이 보내면 학급의 지급 가능한 모든 역할을 한 번에 지급한다. */
function classroomWideRequest(requestKey = "salary-request-100") {
  return new Request("https://example.test/api/classrooms/class-1/roles/pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestKey }),
  });
}

function matchingLedger(where: {
  sourceType: string;
  sourceRef: string;
}) {
  return [...ledger.values()].find(
    (row) =>
      row.sourceType === where.sourceType &&
      row.sourceRef === where.sourceRef,
  ) ?? null;
}

function transactionClient() {
  return {
    classroomRoleDef: {
      findUnique: vi.fn(async () => ({ id: "role-helper", labelKo: "도우미" })),
    },
    classroomRoleSetting: {
      findUnique: vi.fn(async () => ({ enabled: true, salaryAmount: 200 })),
      findMany: vi.fn(async () => [
        {
          classroomRoleId: "role-helper",
          salaryAmount: 200,
          classroomRole: { labelKo: "도우미" },
        },
        {
          classroomRoleId: "role-banker",
          salaryAmount: 500,
          classroomRole: { labelKo: "은행원" },
        },
      ]),
    },
    classroomRoleAssignment: {
      findMany: vi.fn(async ({ where }: { where: { classroomRoleId?: unknown } }) => {
        const perRole = [
          {
            studentId: "student-1",
            classroomRoleId: "role-helper",
            student: { id: "student-1", classroomId: "class-1" },
          },
          {
            studentId: "student-2",
            classroomRoleId: "role-helper",
            student: { id: "student-2", classroomId: "class-1" },
          },
        ];
        // 학급 전체 지급은 `classroomRoleId: { in: [...] }` 로 조회한다.
        const isClassroomWide =
          typeof where.classroomRoleId === "object" && where.classroomRoleId !== null;
        if (!isClassroomWide) return perRole;
        return [
          ...perRole,
          {
            studentId: "student-3",
            classroomRoleId: "role-banker",
            student: { id: "student-3", classroomId: "class-1" },
          },
        ];
      }),
    },
    studentAccount: {
      upsert: vi.fn(async ({ create }: { create: Omit<Account, "id"> }) => {
        let account = accounts.get(create.studentId);
        if (!account) {
          account = { id: `account-${create.studentId}`, ...create };
          accounts.set(create.studentId, account);
        }
        return {
          ...account,
          cards: [...cards.values()].filter((card) => card.accountId === account.id),
        };
      }),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: { balance: { increment: number } };
      }) => {
        const account = [...accounts.values()].find((row) => row.id === where.id);
        if (!account) throw new Error("missing_account");
        account.balance += data.balance.increment;
        return { id: account.id, balance: account.balance };
      }),
    },
    studentCard: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: { accountId: string } }) => {
        const card = { id: `card-${data.accountId}`, accountId: data.accountId };
        cards.set(card.id, card);
        return card;
      }),
    },
    transaction: {
      findFirst: vi.fn(async ({ where }: { where: Parameters<typeof matchingLedger>[0] }) =>
        matchingLedger(where),
      ),
      create: vi.fn(async ({ data }: { data: Omit<Ledger, "id"> }) => {
        if (failLedgerWrite > 0) {
          failLedgerWrite -= 1;
          if (failLedgerWrite === 0) throw new Error("ledger_failed");
        }
        const key = `${data.sourceType}:${data.sourceRef}`;
        if (ledger.has(key)) throw { code: "P2002" };
        const row = { id: `ledger-${ledger.size + 1}`, ...data };
        ledger.set(key, row);
        return row;
      }),
    },
  };
}

describe("POST classroom role salary payout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accounts.clear();
    cards.clear();
    ledger.clear();
    failLedgerWrite = 0;
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFind.mockResolvedValue({ teacherId: "teacher-1" });
    mocks.committedLedgerFind.mockImplementation(async ({ where }) => matchingLedger(where));
    mocks.dbTransaction.mockImplementation(async (operation) => {
      const accountSnapshot = structuredClone([...accounts.entries()]);
      const cardSnapshot = structuredClone([...cards.entries()]);
      const ledgerSnapshot = structuredClone([...ledger.entries()]);
      try {
        return await operation(transactionClient());
      } catch (error) {
        accounts.clear();
        cards.clear();
        ledger.clear();
        for (const row of accountSnapshot) accounts.set(...row);
        for (const row of cardSnapshot) cards.set(...row);
        for (const row of ledgerSnapshot) ledger.set(...row);
        throw error;
      }
    });
  });

  it("pays a multi-student batch from one transaction snapshot", async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      roleKey: "helper",
      paidStudents: 2,
      amount: 200,
    });
    expect(response.headers.get("idempotency-key")).toBe("salary-request-001");
    expect([...accounts.values()].map((account) => account.balance)).toEqual([200, 200]);
    expect(cards.size).toBe(2);
    expect([...ledger.values()].map((row) => row.balanceAfter)).toEqual([200, 200]);
    expect([...ledger.values()].map((row) => row.sourceRef)).toEqual([
      "class-1:salary-request-001",
      "class-1:salary-request-001:student-2",
    ]);
    expect(mocks.dbTransaction).toHaveBeenCalledOnce();
  });

  it("rolls back every account, card, balance, and ledger row on partial failure", async () => {
    failLedgerWrite = 2;

    await expect(POST(request(), context)).rejects.toThrow("ledger_failed");

    expect(accounts.size).toBe(0);
    expect(cards.size).toBe(0);
    expect(ledger.size).toBe(0);
  });

  it("pays every classroom role in one transaction when roleKey is omitted", async () => {
    const response = await POST(classroomWideRequest(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      paidRoles: 2,
      paidStudents: 3,
      totalAmount: 900,
    });
    expect(mocks.dbTransaction).toHaveBeenCalledOnce();
    expect([...accounts.values()].map((account) => account.balance)).toEqual([
      200, 200, 500,
    ]);
  });

  it("rolls back the whole classroom payout on partial failure", async () => {
    failLedgerWrite = 3;

    await expect(POST(classroomWideRequest(), context)).rejects.toThrow(
      "ledger_failed",
    );

    expect(accounts.size).toBe(0);
    expect(ledger.size).toBe(0);
  });

  it("blocks a retried classroom payout with the same request key", async () => {
    const first = await POST(classroomWideRequest(), context);
    const balances = [...accounts.values()].map((account) => account.balance);

    const retry = await POST(classroomWideRequest(), context);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(409);
    expect([...accounts.values()].map((account) => account.balance)).toEqual(
      balances,
    );
  });

  it("returns a deterministic conflict when the same request key is retried", async () => {
    const first = await POST(request(), context);
    const balancesAfterFirst = [...accounts.values()].map((account) => account.balance);

    const retry = await POST(request(), context);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toEqual({
      error: "salary_payout_already_applied",
    });
    expect(retry.headers.get("idempotency-key")).toBe("salary-request-001");
    expect([...accounts.values()].map((account) => account.balance)).toEqual(
      balancesAfterFirst,
    );
    expect(ledger.size).toBe(2);
  });

  it("maps a concurrent unique-gate loss to the same deterministic conflict", async () => {
    mocks.dbTransaction.mockRejectedValueOnce({ code: "P2002" });
    mocks.committedLedgerFind.mockResolvedValueOnce({ id: "winning-ledger" });

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "salary_payout_already_applied",
    });
  });

  it("keeps legacy clients working by generating a request key", async () => {
    const response = await POST(request(null), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
  });

  it.each([
    {
      name: "short body key",
      request: () => request("short"),
      error: "roleKey 또는 requestKey 형식이 올바르지 않습니다.",
    },
    {
      name: "mismatched header and body keys",
      request: () =>
        new Request("https://example.test/api/classrooms/class-1/roles/pay", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "salary-request-002",
          },
          body: JSON.stringify({ roleKey: "helper", requestKey: "salary-request-001" }),
        }),
      error: "idempotency_key_mismatch",
    },
  ])("rejects $name", async ({ request: invalidRequest, error }) => {
    const response = await POST(invalidRequest(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.classroomFind).not.toHaveBeenCalled();
    expect(mocks.dbTransaction).not.toHaveBeenCalled();
  });
});
