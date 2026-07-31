import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDue: vi.fn(),
  updateSubscription: vi.fn(),
  updateSubscriptions: vi.fn(),
  createPayment: vi.fn(),
  findPayment: vi.fn(),
  updatePayment: vi.fn(),
  updatePayments: vi.fn(),
  transaction: vi.fn(),
  charge: vi.fn(),
  getPayment: vi.fn(),
  decrypt: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    teacherSubscription: {
      findMany: mocks.findDue,
      update: mocks.updateSubscription,
      updateMany: mocks.updateSubscriptions,
    },
    paymentEvent: {
      create: mocks.createPayment,
      findUnique: mocks.findPayment,
      update: mocks.updatePayment,
      updateMany: mocks.updatePayments,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/billing/toss", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing/toss")>();
  return {
    ...original,
    chargeBillingKey: mocks.charge,
    getPaymentByOrderId: mocks.getPayment,
  };
});
vi.mock("@/lib/billing/billing-key-crypto", () => ({
  decryptBillingKey: mocks.decrypt,
}));
vi.mock("@/lib/ops/slack", () => ({ notifySlack: mocks.notify }));

import { POST } from "./route";

const periodStart = new Date("2026-07-01T00:00:00.000Z");
const periodEnd = new Date("2026-07-31T00:00:00.000Z");
const sub = {
  userId: "teacher-1",
  plan: "pro_monthly",
  status: "active",
  pgProvider: "toss",
  pgCustomerKey: "customer_key",
  pgBillingKey: "encrypted",
  pgBillingKeyLast4: "1234",
  amount: 4900,
  currency: "KRW",
  currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
  currentPeriodEnd: periodStart,
  canceledAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

function event(leaseUntil = new Date("2026-07-01T00:05:00.000Z")) {
  return {
    id: "payment-1",
    userId: sub.userId,
    subscriptionId: sub.userId,
    type: "charge",
    amount: 4900,
    currency: "KRW",
    status: "pending",
    pgOrderId: "renew_deterministic",
    pgPaymentKey: null,
    billingPeriodKey: `toss:${sub.userId}:${periodStart.toISOString()}`,
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    renewalLeaseToken: "owner",
    renewalLeaseUntil: leaseUntil,
    rawPayload: null,
    errorMessage: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  };
}

function request() {
  return new Request("http://localhost/api/cron/billing-renew", {
    method: "POST",
    headers: { authorization: "Bearer cron-test" },
  });
}

describe("billing renewal cron idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
    process.env.CRON_SECRET = "cron-test";
    mocks.findDue.mockResolvedValue([sub]);
    mocks.decrypt.mockReturnValue("billing-key");
    mocks.notify.mockResolvedValue(undefined);
    mocks.updatePayment.mockResolvedValue(event());
    mocks.updatePayments.mockResolvedValue({ count: 1 });
    mocks.updateSubscription.mockResolvedValue(sub);
    mocks.updateSubscriptions.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it("lets only one concurrent request own a fresh period claim", async () => {
    let claimed = false;
    const claimedEvent = event();
    mocks.createPayment.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return claimedEvent;
      }
      throw new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6.19.3",
      });
    });
    mocks.findPayment.mockResolvedValue(claimedEvent);
    mocks.updatePayments.mockResolvedValue({ count: 0 });
    mocks.getPayment.mockResolvedValue(null);
    mocks.charge.mockResolvedValue({
      paymentKey: "pay-1",
      orderId: claimedEvent.pgOrderId,
      status: "DONE",
      totalAmount: 4900,
      raw: { status: "DONE" },
    });

    const responses = await Promise.all([POST(request()), POST(request())]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(mocks.charge).toHaveBeenCalledOnce();
    expect(mocks.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: claimedEvent.pgOrderId,
        idempotencyKey: expect.stringMatching(/^renewal-/),
      }),
    );
    expect(bodies.flatMap((body) => body.results).map((result) => result.action).sort())
      .toEqual(["renewed", "skipped"]);
  });

  it("reclaims an expired crash lease and reconciles without another charge", async () => {
    const claimedEvent = event(new Date("2026-07-01T00:01:00.000Z"));
    mocks.createPayment.mockResolvedValueOnce(claimedEvent).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    mocks.findPayment.mockResolvedValue(claimedEvent);
    mocks.getPayment
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        paymentKey: "pay-1",
        orderId: claimedEvent.pgOrderId,
        status: "DONE",
        totalAmount: 4900,
        raw: { status: "DONE" },
      });
    mocks.charge.mockRejectedValueOnce(new Error("connection reset"));

    const first = await POST(request());
    expect((await first.json()).results[0].action).toBe("skipped");

    vi.setSystemTime(new Date("2026-07-01T00:06:00.000Z"));
    const retry = await POST(request());

    expect((await retry.json()).results[0].action).toBe("renewed");
    expect(mocks.charge).toHaveBeenCalledOnce();
    expect(mocks.updatePayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              renewalLeaseUntil: {
                lte: new Date("2026-07-01T00:06:00.000Z"),
              },
            },
          ]),
        }),
      }),
    );
  });

  it("does not POST a reclaimed claim while provider verification is unavailable", async () => {
    const claimedEvent = event(new Date("2026-07-01T00:01:00.000Z"));
    mocks.createPayment.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    );
    mocks.findPayment.mockResolvedValue(claimedEvent);
    mocks.updatePayments.mockResolvedValue({ count: 1 });
    mocks.getPayment.mockRejectedValue(new Error("provider unavailable"));
    vi.setSystemTime(new Date("2026-07-01T00:06:00.000Z"));

    const response = await POST(request());

    expect((await response.json()).results[0]).toEqual(
      expect.objectContaining({
        action: "skipped",
        detail: "provider verification pending retry",
      }),
    );
    expect(mocks.charge).not.toHaveBeenCalled();
  });
});
