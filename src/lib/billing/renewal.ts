import { createHash } from "crypto";

export const RENEWAL_LEASE_MS = 5 * 60 * 1000;

export function getRenewalIdentity(userId: string, periodStart: Date) {
  const periodKey = `toss:${userId}:${periodStart.toISOString()}`;
  const digest = createHash("sha256").update(periodKey).digest("hex");
  return {
    periodKey,
    orderId: `renew_${digest.slice(0, 40)}`,
    idempotencyKey: `renewal-${digest}`,
  };
}

export function isTerminalTossStatus(status: string): boolean {
  return ["CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"].includes(
    status,
  );
}
