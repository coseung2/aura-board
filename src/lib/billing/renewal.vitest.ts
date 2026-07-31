import { describe, expect, it } from "vitest";
import { getRenewalIdentity } from "./renewal";

describe("billing renewal identity", () => {
  it("is deterministic per subscription period and changes across periods", () => {
    const first = getRenewalIdentity(
      "teacher-1",
      new Date("2026-07-01T00:00:00.000Z"),
    );
    const retry = getRenewalIdentity(
      "teacher-1",
      new Date("2026-07-01T00:00:00.000Z"),
    );
    const next = getRenewalIdentity(
      "teacher-1",
      new Date("2026-07-31T00:00:00.000Z"),
    );

    expect(retry).toEqual(first);
    expect(next.periodKey).not.toBe(first.periodKey);
    expect(next.orderId).not.toBe(first.orderId);
    expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(first.orderId).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
  });
});
