import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertWebhook: vi.fn(),
  getPayment: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { tossWebhookEvent: { upsert: mocks.upsertWebhook } },
}));
vi.mock("@/lib/billing/toss", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing/toss")>();
  return { ...original, getPaymentByOrderId: mocks.getPayment };
});
vi.mock("@/lib/billing/toss-webhook", () => ({
  reconcileTossWebhookEventsForOrder: mocks.reconcile,
}));

import { POST } from "./route";

const payload = {
  eventType: "PAYMENT_STATUS_CHANGED",
  createdAt: "2026-07-31T12:00:00.000Z",
  data: {
    orderId: "order-123456",
    paymentKey: "payment-key",
    status: "DONE",
    totalAmount: 4900,
    currency: "KRW",
  },
};

describe("Toss webhook ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPayment.mockResolvedValue({
      ...payload.data,
      raw: { ...payload.data, method: "카드" },
    });
    mocks.upsertWebhook.mockResolvedValue({ id: "webhook-1" });
    mocks.reconcile.mockResolvedValue(false);
  });

  it("durably stores a provider-verified event even before its payment row exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/billing/webhook/toss", {
        method: "POST",
        headers: { "tosspayments-webhook-transmission-id": "tx-1" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, matched: false });
    expect(mocks.getPayment).toHaveBeenCalledWith(payload.data.orderId);
    expect(mocks.upsertWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          transmissionId: "tx-1",
          orderId: payload.data.orderId,
          providerStatus: "DONE",
        }),
      }),
    );
  });

  it("rejects spoofed state before writing the inbox", async () => {
    mocks.getPayment.mockResolvedValue({
      ...payload.data,
      paymentKey: "different-payment-key",
      raw: { status: "DONE" },
    });

    const response = await POST(
      new Request("http://localhost/api/billing/webhook/toss", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.upsertWebhook).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
