import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logs: [] as Array<Record<string, unknown>>,
  transactions: [] as Array<Record<string, unknown>>,
  balance: 0,
  award: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(async () => ({
    id: "student-1",
    classroomId: "classroom-1",
    name: "학생",
  })),
}));
vi.mock("@/lib/bank", () => ({
  ensureAccountFor: vi.fn(async () => ({ accountId: "account-1", cardId: "card-1" })),
}));
vi.mock("@/lib/reading-evaluator", () => ({
  evaluateReadingLog: vi.fn(() => ({ score: 5, feedback: "좋아요" })),
}));
vi.mock("@/lib/avatar-rewards", () => ({
  retryReadingRewardTransaction: (operation: () => Promise<unknown>) => operation(),
  awardReadingReward: mocks.award,
}));
vi.mock("@/lib/db", () => {
  const tx = {
    readingLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date("2026-07-20T00:00:00.000Z");
        const row = { id: "reading-1", ...data, createdAt: now, updatedAt: now };
        mocks.logs.push(row);
        return row;
      }),
    },
  };
  return {
    db: {
      readingLog: { findMany: vi.fn(), create: tx.readingLog.create },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
        const logSnapshot = [...mocks.logs];
        const transactionSnapshot = [...mocks.transactions];
        const balanceSnapshot = mocks.balance;
        try {
          return await operation(tx);
        } catch (error) {
          mocks.logs.splice(0, mocks.logs.length, ...logSnapshot);
          mocks.transactions.splice(0, mocks.transactions.length, ...transactionSnapshot);
          mocks.balance = balanceSnapshot;
          throw error;
        }
      }),
    },
  };
});

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/student/reading", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bookType: "story",
      title: "어린 왕자",
      author: "생텍쥐페리",
      reflection: "친구를 소중하게 생각해야 한다고 느꼈어요.",
    }),
  });
}

describe("reading log and reward transaction", () => {
  beforeEach(() => {
    mocks.logs.length = 0;
    mocks.transactions.length = 0;
    mocks.balance = 0;
    mocks.award.mockReset();
  });

  it("rolls the reading log, wallet, and transaction back together", async () => {
    mocks.award.mockImplementationOnce(async ({ tx }: { tx?: unknown }) => {
      expect(tx).toBeDefined();
      mocks.balance += 25;
      mocks.transactions.push({ sourceType: "reading_reward", amount: 25 });
      throw new Error("reward transaction failed");
    });

    await expect(POST(request())).rejects.toThrow("reward transaction failed");
    expect(mocks.logs).toHaveLength(0);
    expect(mocks.balance).toBe(0);
    expect(mocks.transactions).toHaveLength(0);
  });
});
