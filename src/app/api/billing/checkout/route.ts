// POST /api/billing/checkout — 구독 업그레이드 준비.
// 1) customerKey (없으면 발급·저장) + orderId (매 호출 새로) 반환
// 2) 클라이언트는 이 값으로 Toss JS SDK `requestBillingAuth` 호출
// 3) Toss가 successUrl(/billing/callback) 로 authKey + customerKey 붙여 리다이렉트
//
// 결제 금액 자체는 confirm 단계에서 결정되므로 여기선 planKey만 기록.

import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_CATALOG, getPublicClientKey } from "@/lib/billing/toss";
import { limitBillingCheckout } from "@/lib/rate-limit-routes";
import { reconcileTossWebhookEventsForOrder } from "@/lib/billing/toss-webhook";

const Schema = z.object({
  planKey: z.enum(["pro_monthly", "pro_yearly"]),
});

function newCustomerKey(): string {
  // Toss는 고유 문자열(<= 50자)만 요구. 소셜/프로덕트 바꿔도 안전하도록 랜덤.
  return `aura_${randomBytes(12).toString("hex")}`;
}

function newOrderId(): string {
  return `order_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const rl = await limitBillingCheckout(user.id);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfter: rl.retryAfter }),
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const tossClientKey = getPublicClientKey();
  if (!tossClientKey) {
    return new Response(
      JSON.stringify({
        error: "billing_not_configured",
        message: "Toss Payments 키가 설정되지 않았습니다. 관리자에게 문의해 주세요.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400 });
  }
  const plan = PLAN_CATALOG[parsed.data.planKey];

  // Upsert subscription row to lock in customerKey.
  const existing = await db.teacherSubscription.findUnique({ where: { userId: user.id } });
  const customerKey = existing?.pgCustomerKey ?? newCustomerKey();

  await db.teacherSubscription.upsert({
    where: { userId: user.id },
    update: { pgCustomerKey: customerKey },
    create: {
      userId: user.id,
      plan: "free", // confirm 이후에 pro_* 로 승급
      status: "active",
      pgProvider: "toss",
      pgCustomerKey: customerKey,
    },
  });

  const orderId = newOrderId();

  await db.paymentEvent.create({
    data: {
      userId: user.id,
      subscriptionId: user.id,
      type: "charge",
      amount: plan.amount,
      currency: "KRW",
      status: "pending",
      pgOrderId: orderId,
    },
  });

  // A verified provider event can arrive before this local row is committed.
  await reconcileTossWebhookEventsForOrder(orderId);

  return new Response(
    JSON.stringify({
      tossClientKey,
      customerKey,
      orderId,
      orderName: plan.label,
      amount: plan.amount,
      planKey: plan.planKey,
      customerEmail: user.email,
      customerName: user.name,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
