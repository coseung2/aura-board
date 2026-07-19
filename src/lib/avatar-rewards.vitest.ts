import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import {
  isSerializableTransactionConflict,
  reverseReadingReward,
  retryReadingRewardTransaction,
} from "./avatar-rewards";

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: "test" });
}

describe("reading reward transaction retry", () => {
  it("retries the complete transaction on serializable conflicts", async () => {
    let attempts = 0;
    const result = await retryReadingRewardTransaction(async () => {
      attempts += 1;
      if (attempts < 3) throw prismaError("P2034");
      return "committed";
    });

    expect(result).toBe("committed");
    expect(attempts).toBe(3);
  });

  it("does not retry unrelated database errors", async () => {
    let attempts = 0;
    await expect(
      retryReadingRewardTransaction(async () => {
        attempts += 1;
        throw prismaError("P2002");
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(attempts).toBe(1);
    expect(isSerializableTransactionConflict(prismaError("P2034"))).toBe(true);
    expect(isSerializableTransactionConflict(prismaError("P2002"))).toBe(false);
  });
});

describe("reading reward reversal audit", () => {
  it("marks the progress event reversed without changing its progress snapshots", async () => {
    const event = { progressBefore: 2, progressAfter: 3, reversedAt: null as Date | null };
    const tx = {
      studentAccount: {
        findUnique: vi.fn(async () => ({ id: "account-1", balance: 100 })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: vi.fn(async () => ({ balance: 75 })),
      },
      transaction: {
        count: vi.fn(async () => 0),
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ amount: 25 }),
        create: vi.fn(async () => ({ id: "reversal-1" })),
      },
      creatureProgressEvent: {
        updateMany: vi.fn(async ({ data }: { data: { reversedAt: Date } }) => {
          event.reversedAt = data.reversedAt;
          return { count: 1 };
        }),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await reverseReadingReward(tx, {
      studentId: "student-1",
      readingLogId: "reading-1",
      performerId: "teacher-1",
    });

    expect(result).toMatchObject({ amount: 25, balance: 75, idempotent: false });
    expect(event.reversedAt).toBeInstanceOf(Date);
    expect(event).toMatchObject({ progressBefore: 2, progressAfter: 3 });
    expect(tx.creatureProgressEvent.updateMany).toHaveBeenCalledWith({
      where: {
        studentId: "student-1",
        sourceType: "reading_reward",
        sourceRef: "reading-1",
        reversedAt: null,
      },
      data: { reversedAt: expect.any(Date) },
    });
  });
});
