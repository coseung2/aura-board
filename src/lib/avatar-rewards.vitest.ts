import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import {
  isSerializableTransactionConflict,
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

