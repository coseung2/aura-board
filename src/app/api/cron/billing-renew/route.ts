// POST /api/cron/billing-renew — 정기결제 자동 갱신 (Seed 14 follow-up, 2026-04-22).
//
// Vercel Cron이 매일 호출(KST 03:00 ≈ UTC 18:00 전날).
// 대상: currentPeriodEnd <= now() 이면서 status=active, canceledAt=null, billingKey 존재.
// 각 구독에 대해 chargeBillingKey 재호출 → 성공 시 다음 기간 확장, 실패 시 past_due.
//
// 보안: Vercel Cron은 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동 주입.
// 로컬/수동 호출도 동일한 시크릿으로만 허용. CRON_SECRET 미설정 배포는 401 반환.

import { db } from "@/lib/db";
import {
  chargeBillingKey,
  PLAN_CATALOG,
  TossConfigMissingError,
  type PlanKey,
} from "@/lib/billing/toss";
import { decryptBillingKey } from "@/lib/billing/billing-key-crypto";
import { notifySlack } from "@/lib/ops/slack";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

function nextPeriodEnd(plan: PlanKey, from: Date): Date {
  const meta = PLAN_CATALOG[plan];
  return new Date(from.getTime() + meta.periodDays * 24 * 60 * 60 * 1000);
}

function newOrderId(userId: string): string {
  const stamp = Date.now().toString(36);
  return `renew_${userId.slice(0, 8)}_${stamp}`;
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();

  // 만료가 임박하거나 지난 active 구독만 스캔. canceled(canceledAt != null)은 기간이
  // 끝나야 하므로 갱신 제외(아래 반복문 안에서 status=canceled로 전환).
  const due = await db.teacherSubscription.findMany({
    where: {
      status: "active",
      plan: { not: "free" },
      currentPeriodEnd: { lte: now },
      pgBillingKey: { not: null },
      pgCustomerKey: { not: null },
    },
  });

  const results: Array<{
    userId: string;
    action: "renewed" | "canceled" | "past_due" | "skipped";
    detail?: string;
  }> = [];

  for (const sub of due) {
    // 취소 예약된 구독은 이 시점에 실제 canceled 처리.
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
      results.push({ userId: sub.userId, action: "skipped", detail: `unknown plan ${sub.plan}` });
      continue;
    }
    const plan = PLAN_CATALOG[planKey];

    if (!sub.pgBillingKey || !sub.pgCustomerKey) {
      results.push({ userId: sub.userId, action: "past_due", detail: "missing billing key" });
      await db.teacherSubscription.update({
        where: { userId: sub.userId },
        data: { status: "past_due" },
      });
      continue;
    }

    // 빌링키 복호화 — 실패 시 재결제 필요 상태로 전환.
    let billingKeyPlain: string;
    try {
      billingKeyPlain = decryptBillingKey(sub.pgBillingKey);
    } catch (err) {
      results.push({
        userId: sub.userId,
        action: "past_due",
        detail: `decrypt failed: ${(err as Error).message}`,
      });
      await db.teacherSubscription.update({
        where: { userId: sub.userId },
        data: { status: "past_due" },
      });
      continue;
    }

    const orderId = newOrderId(sub.userId);

    // 이벤트 레코드 pending 으로 미리 생성 — 실결제 후 상태 갱신.
    await db.paymentEvent.create({
      data: {
        userId: sub.userId,
        subscriptionId: sub.userId,
        type: "charge",
        amount: plan.amount,
        currency: "KRW",
        status: "pending",
        pgOrderId: orderId,
      },
    });

    try {
      const charge = await chargeBillingKey({
        billingKey: billingKeyPlain,
        customerKey: sub.pgCustomerKey,
        amount: plan.amount,
        orderId,
        orderName: plan.label,
      });

      const periodStart = sub.currentPeriodEnd ?? now;
      const periodEnd = nextPeriodEnd(planKey, periodStart);

      await db.teacherSubscription.update({
        where: { userId: sub.userId },
        data: {
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });
      await db.paymentEvent.updateMany({
        where: { pgOrderId: orderId },
        data: {
          status: "succeeded",
          pgPaymentKey: charge.paymentKey,
          rawPayload: charge.raw as never,
        },
      });
      results.push({ userId: sub.userId, action: "renewed", detail: periodEnd.toISOString() });
    } catch (err) {
      if (err instanceof TossConfigMissingError) {
        // Toss 설정 자체가 빠진 배포 — cron을 fail 처리하지 말고 노출.
        return new Response(
          JSON.stringify({ error: "toss_not_configured" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      const msg = (err as Error).message;
      await db.paymentEvent.updateMany({
        where: { pgOrderId: orderId },
        data: { status: "failed", errorMessage: msg },
      });
      await db.teacherSubscription.update({
        where: { userId: sub.userId },
        data: { status: "past_due" },
      });
      results.push({ userId: sub.userId, action: "past_due", detail: msg });
    }
  }

  // 실패·과거결제(past_due) 건 수 요약 알림.
  const failures = results.filter((r) => r.action === "past_due");
  if (failures.length > 0) {
    await notifySlack({
      severity: "warn",
      title: "billing-renew: past_due 발생",
      detail: `${failures.length}건의 구독이 갱신 실패로 past_due 상태가 되었습니다.`,
      context: {
        scanned: due.length,
        past_due: failures.length,
        user_ids: failures.map((f) => f.userId).slice(0, 10),
      },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: due.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// Vercel Cron은 기본 GET. 본 라우트는 POST만 허용하므로 GET fallback 추가.
export async function GET(req: Request) {
  return POST(req);
}
