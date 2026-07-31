import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chargeBillingKey, getPaymentByOrderId } from "./toss";

describe("Toss billing adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the deterministic provider idempotency key on renewal charges", async () => {
    vi.stubEnv("TOSS_SECRET_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          paymentKey: "payment-1",
          orderId: "renew_order",
          status: "DONE",
          totalAmount: 4900,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await chargeBillingKey({
      billingKey: "billing-key",
      customerKey: "customer-key",
      amount: 4900,
      orderId: "renew_order",
      orderName: "Aura Board Pro",
      idempotencyKey: "renewal-stable-key",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/billing/billing-key"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "renewal-stable-key",
        }),
      }),
    );
  });

  it("authenticates provider payment lookup without putting a secret in the URL", async () => {
    vi.stubEnv("TOSS_SECRET_KEY", "server-only-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          paymentKey: "payment-1",
          orderId: "order-123456",
          status: "DONE",
          totalAmount: 4900,
          currency: "KRW",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPaymentByOrderId("order-123456");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.tosspayments.com/v1/payments/orders/order-123456",
    );
    expect(url).not.toContain("server-only-secret");
    expect(init.headers.Authorization).toMatch(/^Basic /);
  });
});
