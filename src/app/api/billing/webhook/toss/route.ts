// POST /api/billing/webhook/toss
// General Toss payment webhooks do not have a supported signature. Trust is
// established by querying Toss with the server-side secret key and comparing
// the returned payment before the event enters the durable inbox.

import { createHash } from "crypto";
import { db } from "@/lib/db";
import {
  getPaymentByOrderId,
  TossConfigMissingError,
} from "@/lib/billing/toss";
import { reconcileTossWebhookEventsForOrder } from "@/lib/billing/toss-webhook";

type PaymentWebhookPayload = {
  eventType?: string;
  createdAt?: string;
  data?: {
    orderId?: string;
    paymentKey?: string;
    status?: string;
    totalAmount?: number;
    currency?: string;
  };
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  let payload: PaymentWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PaymentWebhookPayload;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { eventType, data } = payload;
  if (
    !eventType ||
    !data?.orderId ||
    !data.paymentKey ||
    !data.status
  ) {
    return json({ error: "unsupported_event" }, 400);
  }

  let verified;
  try {
    verified = await getPaymentByOrderId(data.orderId);
  } catch (error) {
    if (error instanceof TossConfigMissingError) {
      return json({ error: "webhook_not_configured" }, 503);
    }
    // Non-2xx asks Toss to retry instead of acknowledging an unverified event.
    return json({ error: "provider_verification_unavailable" }, 502);
  }

  if (
    !verified ||
    verified.orderId !== data.orderId ||
    verified.paymentKey !== data.paymentKey ||
    (data.totalAmount !== undefined &&
      verified.totalAmount !== data.totalAmount) ||
    (data.currency !== undefined && verified.currency !== data.currency)
  ) {
    return json({ error: "provider_verification_failed" }, 403);
  }

  // Deduplicate provider retries and harmless body/header variations by the
  // verified payment state, not by attacker-controlled raw bytes.
  const eventKey = createHash("sha256")
    .update(
      [eventType, verified.orderId, verified.paymentKey, verified.status].join(
        ":",
      ),
    )
    .digest("hex");
  await db.tossWebhookEvent.upsert({
    where: { eventKey },
    update: {},
    create: {
      eventKey,
      transmissionId:
        req.headers.get("tosspayments-webhook-transmission-id") ?? null,
      eventType,
      orderId: verified.orderId,
      paymentKey: verified.paymentKey,
      providerStatus: verified.status,
      rawPayload: payload as never,
      verifiedPayload: verified.raw as never,
    },
  });

  const matched = await reconcileTossWebhookEventsForOrder(verified.orderId);
  return json({ ok: true, matched }, 200);
}
