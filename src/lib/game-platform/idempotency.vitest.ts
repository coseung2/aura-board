import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalJson,
  IdempotencyConflictError,
  withPlayRequestReceipt,
} from "./idempotency";

const receipts: Array<{
  id: string;
  scopeType: string;
  scopeId: string;
  requestId: string;
  requestHash: string;
  response: Prisma.JsonValue;
  createdAt: Date;
}> = [];
const events: string[] = [];

const findUnique = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
  events.push("receipt_lookup");
  const key = where.scopeType_scopeId_requestId as {
    scopeType: string;
    scopeId: string;
    requestId: string;
  };
  return (
    receipts.find(
      (receipt) =>
        receipt.scopeType === key.scopeType &&
        receipt.scopeId === key.scopeId &&
        receipt.requestId === key.requestId,
    ) ?? null
  );
});
const create = vi.fn(async ({ data }: { data: (typeof receipts)[number] }) => {
  events.push("receipt_insert");
  const row = { ...data, createdAt: new Date() };
  receipts.push(row);
  return row;
});
const tx = {
  playRequestReceipt: { findUnique, create },
} as unknown as Prisma.TransactionClient;

const base = {
  actorSubject: "student:student-1",
  scopeType: "kordle_attempt_command" as const,
  scopeId: "attempt-1",
  requestId: "request-1",
  requestBody: { expectedVersion: 3, guess: "planet" },
};

describe("game platform idempotency", () => {
  beforeEach(() => {
    receipts.length = 0;
    events.length = 0;
    findUnique.mockClear();
    create.mockClear();
  });

  it("canonicalizes object keys before hashing", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      '{"a":{"x":3,"y":2},"z":1}',
    );
  });

  it("looks up the receipt before executing and replays exact responses", async () => {
    const execute = vi.fn(async () => {
      events.push("version_check_and_mutation");
      return { version: 4, status: "won" } as Prisma.InputJsonObject;
    });

    const first = await withPlayRequestReceipt(tx, base, execute);
    const replay = await withPlayRequestReceipt(tx, base, execute);

    expect(first).toEqual({
      response: { version: 4, status: "won" },
      replayed: false,
    });
    expect(replay).toEqual({
      response: { version: 4, status: "won" },
      replayed: true,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "receipt_lookup",
      "version_check_and_mutation",
      "receipt_insert",
      "receipt_lookup",
    ]);
  });

  it("rejects the same request id for another payload or actor", async () => {
    await withPlayRequestReceipt(tx, base, async () => ({ ok: true }));

    await expect(
      withPlayRequestReceipt(
        tx,
        { ...base, requestBody: { expectedVersion: 3, guess: "school" } },
        async () => ({ ok: false }),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    await expect(
      withPlayRequestReceipt(
        tx,
        { ...base, actorSubject: "student:student-2" },
        async () => ({ ok: false }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "idempotency_key_reuse",
    });
  });
});
