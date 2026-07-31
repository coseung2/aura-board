import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayment: vi.fn(),
  updatePayment: vi.fn(),
  findWebhook: vi.fn(),
  updateWebhooks: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentEvent: {
      findUnique: mocks.findPayment,
      update: mocks.updatePayment,
    },
    tossWebhookEvent: {
      findFirst: mocks.findWebhook,
      updateMany: mocks.updateWebhooks,
    },
    $transaction: mocks.transaction,
  },
}));

import { reconcileTossWebhookEventsForOrder } from "./toss-webhook";

describe("Toss webhook reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePayment.mockResolvedValue({});
    mocks.updateWebhooks.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });

  it("replays a previously unmatched verified event once the payment exists", async () => {
    mocks.findPayment.mockResolvedValue({
      id: "payment-1",
      userId: "teacher-1",
    });
    mocks.findWebhook.mockResolvedValue({
      id: "webhook-1",
      providerStatus: "DONE",
      paymentKey: "provider-payment-1",
      verifiedPayload: { status: "DONE" },
    });

    await expect(
      reconcileTossWebhookEventsForOrder("order-123456"),
    ).resolves.toBe(true);
    expect(mocks.updatePayment).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: {
        status: "succeeded",
        pgPaymentKey: "provider-payment-1",
        rawPayload: { status: "DONE" },
      },
    });
    expect(mocks.updateWebhooks).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchedPaymentEventId: "payment-1",
          userId: "teacher-1",
        }),
      }),
    );
  });
});
