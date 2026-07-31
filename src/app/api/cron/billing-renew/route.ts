// POST /api/cron/billing-renew — recurring subscription renewal.

import { randomUUID } from "crypto";
import { Prisma, type PaymentEvent, type TeacherSubscription } from "@prisma/client";
import { db } from "@/lib/db";
import {
  chargeBillingKey,
  getPaymentByOrderId,
  PLAN_CATALOG,
  TossApiError,
  TossConfigMissingError,
  type PlanKey,
  type TossPayment,
} from "@/lib/billing/toss";
import { decryptBillingKey } from "@/lib/billing/billing-key-crypto";
import {
  getRenewalIdentity,
  isTerminalTossStatus,
  RENEWAL_LEASE_MS,
} from "@/lib/billing/renewal";
import { notifySlack } from "@/lib/ops/slack";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

type RenewalResult = {
  userId: string;
  action: "renewed" | "canceled" | "past_due" | "skipped";
  detail?: string;
};

function nextPeriodEnd(plan: PlanKey, from: Date): Date {
  return new Date(
    from.getTime() + PLAN_CATALOG[plan].periodDays * 24 * 60 * 60 * 1000,
  );
}

async function acquireClaim(
  sub: TeacherSubscription,
  planKey: PlanKey,
  now: Date,
): Promise<{
  event: PaymentEvent;
  token: string;
  idempotencyKey: string;
  isNew: boolean;
} | null> {
  const periodStart = sub.currentPeriodEnd;
  if (!periodStart) return null;
  const periodEnd = nextPeriodEnd(planKey, periodStart);
  const identity = getRenewalIdentity(sub.userId, periodStart);
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + RENEWAL_LEASE_MS);

  try {
    const event = await db.paymentEvent.create({
      data: {
        userId: sub.userId,
        subscriptionId: sub.userId,
        type: "charge",
        amount: PLAN_CATALOG[planKey].amount,
        currency: "KRW",
        status: "pending",
        pgOrderId: identity.orderId,
        billingPeriodKey: identity.periodKey,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        renewalLeaseToken: token,
        renewalLeaseUntil: leaseUntil,
      },
    });
    return {
      event,
      token,
      idempotencyKey: identity.idempotencyKey,
      isNew: true,
    };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const existing = await db.paymentEvent.findUnique({
    where: { billingPeriodKey: identity.periodKey },
  });
  if (!existing || existing.status !== "pending") return null;

  const acquired = await db.paymentEvent.updateMany({
    where: {
      id: existing.id,
      status: "pending",
      OR: [
        { renewalLeaseUntil: null },
        { renewalLeaseUntil: { lte: now } },
      ],
    },
    data: { renewalLeaseToken: token, renewalLeaseUntil: leaseUntil },
  });
  if (acquired.count !== 1) return null;
  return {
    event: { ...existing, renewalLeaseToken: token, renewalLeaseUntil: leaseUntil },
    token,
    idempotencyKey: identity.idempotencyKey,
    isNew: false,
  };
}

function validSuccessfulPayment(
  payment: TossPayment,
  event: PaymentEvent,
): boolean {
  return (
    payment.status === "DONE" &&
    payment.orderId === event.pgOrderId &&
    payment.totalAmount === event.amount
  );
}

async function completeRenewal(event: PaymentEvent, payment: TossPayment) {
  if (!event.billingPeriodStart || !event.billingPeriodEnd) {
    throw new Error("renewal period is missing");
  }
  await db.$transaction([
    db.paymentEvent.update({
      where: { id: event.id },
      data: {
        status: "succeeded",
        pgPaymentKey: payment.paymentKey,
        rawPayload: payment.raw as never,
        errorMessage: null,
        renewalLeaseToken: null,
        renewalLeaseUntil: null,
      },
    }),
    db.teacherSubscription.updateMany({
      where: {
        userId: event.userId,
        status: "active",
        currentPeriodEnd: event.billingPeriodStart,
      },
      data: {
        currentPeriodStart: event.billingPeriodStart,
        currentPeriodEnd: event.billingPeriodEnd,
      },
    }),
  ]);
}

async function failRenewal(event: PaymentEvent, message: string) {
  await db.$transaction([
    db.paymentEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        errorMessage: message,
        renewalLeaseToken: null,
        renewalLeaseUntil: null,
      },
    }),
    db.teacherSubscription.update({
      where: { userId: event.userId },
      data: { status: "past_due" },
    }),
  ]);
}

async function processClaim(
  sub: TeacherSubscription,
  planKey: PlanKey,
  claim: NonNullable<Awaited<ReturnType<typeof acquireClaim>>>,
): Promise<RenewalResult> {
  const { event, idempotencyKey, isNew } = claim;
  const orderId = event.pgOrderId!;
  const plan = PLAN_CATALOG[planKey];

  let knownPayment: TossPayment | null = null;
  try {
    knownPayment = await getPaymentByOrderId(orderId);
  } catch (error) {
    if (error instanceof TossConfigMissingError) throw error;
    // A fresh claim cannot have reached the provider yet. A reclaimed claim
    // must wait for authenticated reconciliation before another POST.
    if (!isNew) {
      return {
        userId: sub.userId,
        action: "skipped",
        detail: "provider verification pending retry",
      };
    }
  }

  if (!knownPayment) {
    let billingKey: string;
    try {
      billingKey = decryptBillingKey(sub.pgBillingKey!);
    } catch (error) {
      const message = `decrypt failed: ${(error as Error).message}`;
      await failRenewal(event, message);
      return { userId: sub.userId, action: "past_due", detail: message };
    }

    try {
      const charged = await chargeBillingKey({
        billingKey,
        customerKey: sub.pgCustomerKey!,
        amount: plan.amount,
        orderId,
        orderName: plan.label,
        idempotencyKey,
      });
      knownPayment = {
        paymentKey: charged.paymentKey,
        orderId: charged.orderId,
        status: charged.status,
        totalAmount: charged.totalAmount,
        raw: charged.raw as Record<string, unknown>,
      };
    } catch (chargeError) {
      if (chargeError instanceof TossConfigMissingError) throw chargeError;
      try {
        knownPayment = await getPaymentByOrderId(orderId);
      } catch {
        // Keep the claim pending. A later cron retries with the same provider key.
      }
      if (!knownPayment) {
        const isHardFailure =
          chargeError instanceof TossApiError &&
          chargeError.status >= 400 &&
          chargeError.status < 500 &&
          chargeError.status !== 429;
        if (isHardFailure) {
          const message = chargeError.message;
          await failRenewal(event, message);
          return { userId: sub.userId, action: "past_due", detail: message };
        }
        return {
          userId: sub.userId,
          action: "skipped",
          detail: "provider result pending retry",
        };
      }
    }
  }

  if (validSuccessfulPayment(knownPayment, event)) {
    await completeRenewal(event, knownPayment);
    return {
      userId: sub.userId,
      action: "renewed",
      detail: event.billingPeriodEnd!.toISOString(),
    };
  }

  if (isTerminalTossStatus(knownPayment.status)) {
    const message = `provider status ${knownPayment.status}`;
    await failRenewal(event, message);
    return { userId: sub.userId, action: "past_due", detail: message };
  }

  return {
    userId: sub.userId,
    action: "skipped",
    detail: `provider status ${knownPayment.status}`,
  };
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const due = await db.teacherSubscription.findMany({
    where: {
      status: "active",
      plan: { not: "free" },
      currentPeriodEnd: { lte: now },
      pgBillingKey: { not: null },
      pgCustomerKey: { not: null },
    },
  });
  const results: RenewalResult[] = [];

  for (const sub of due) {
    if (sub.canceledAt) {
      await db.teacherSubscription.update({
        where: { userId: sub.userId },
        data: { status: "canceled", pgBillingKey: null },
      });
      results.push({ userId: sub.userId, action: "canceled" });
      continue;
    }

    const planKey = sub.plan as PlanKey;
    if (!(planKey in PLAN_CATALOG)) {
      results.push({
        userId: sub.userId,
        action: "skipped",
        detail: `unknown plan ${sub.plan}`,
      });
      continue;
    }

    const claim = await acquireClaim(sub, planKey, now);
    if (!claim) {
      results.push({
        userId: sub.userId,
        action: "skipped",
        detail: "renewal already claimed",
      });
      continue;
    }

    try {
      results.push(await processClaim(sub, planKey, claim));
    } catch (error) {
      if (error instanceof TossConfigMissingError) {
        return new Response(JSON.stringify({ error: "toss_not_configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw error;
    }
  }

  const failures = results.filter((result) => result.action === "past_due");
  if (failures.length > 0) {
    await notifySlack({
      severity: "warn",
      title: "billing-renew: past_due",
      detail: `${failures.length} subscription renewal(s) failed.`,
      context: {
        scanned: due.length,
        past_due: failures.length,
        user_ids: failures.map((failure) => failure.userId).slice(0, 10),
      },
    });
  }

  return new Response(JSON.stringify({ ok: true, scanned: due.length, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  return POST(req);
}
