import { db } from "@/lib/db";
import { isTerminalTossStatus } from "@/lib/billing/renewal";

export function localPaymentStatus(providerStatus: string) {
  if (providerStatus === "DONE") return "succeeded";
  if (isTerminalTossStatus(providerStatus) || providerStatus === "FAILED") {
    return "failed";
  }
  return null;
}

/** Applies verified inbox entries after either side of the delivery/create race. */
export async function reconcileTossWebhookEventsForOrder(
  orderId: string,
): Promise<boolean> {
  const [payment, webhook] = await Promise.all([
    db.paymentEvent.findUnique({ where: { pgOrderId: orderId } }),
    db.tossWebhookEvent.findFirst({
      where: { orderId, processedAt: null },
      orderBy: { receivedAt: "desc" },
    }),
  ]);
  if (!payment || !webhook) return false;

  const status = localPaymentStatus(webhook.providerStatus);
  await db.$transaction([
    db.paymentEvent.update({
      where: { id: payment.id },
      data: {
        ...(status ? { status } : {}),
        pgPaymentKey: webhook.paymentKey,
        rawPayload: webhook.verifiedPayload as never,
      },
    }),
    db.tossWebhookEvent.updateMany({
      where: { orderId, processedAt: null },
      data: {
        matchedPaymentEventId: payment.id,
        userId: payment.userId,
        processedAt: new Date(),
      },
    }),
  ]);
  return true;
}
