// Toss Payments 정기결제(빌링키) 어댑터 (Seed 14 scaffold, 2026-04-22).
// https://docs.tosspayments.com/guides/v2/billing/integration
//
// 플로우:
//   1) 클라이언트가 Toss JS SDK로 requestBillingAuth 호출 → 카드 인증
//   2) successUrl (/billing/callback) 로 authKey + customerKey 가 쿼리로 돌아옴
//   3) 서버가 issueBillingKey(authKey, customerKey) 로 빌링키 발급 → DB 저장
//   4) 즉시 chargeBillingKey 로 첫 결제 → currentPeriodStart/End 세팅
//   5) 매달 cron(/api/cron/billing-renew) 이 chargeBillingKey 로 재결제
//
// 환경 변수:
//   TOSS_CLIENT_KEY   — 공개 키(client-safe)
//   TOSS_SECRET_KEY   — 시크릿 키(Basic auth 용). 없으면 어댑터는 503 모드
//   TOSS_API_BASE     — 기본 "https://api.tosspayments.com" (테스트·프로덕션 동일)

import "server-only";

const API_BASE = process.env.TOSS_API_BASE ?? "https://api.tosspayments.com";

export type BillingKeyAuthorizeInput = {
  authKey: string;
  customerKey: string;
};

export type BillingKeyAuthorizeResult = {
  billingKey: string;
  customerKey: string;
  cardCompany?: string;
  cardNumber?: string; // 마스킹된 카드번호 (Toss 응답 원문)
  method?: string;
};

export type ChargeInput = {
  billingKey: string;
  customerKey: string;
  amount: number; // KRW 정수
  orderId: string; // uuid 등 고유값
  orderName: string; // "Aura-board Pro 월 이용권" 등
  customerEmail?: string;
  customerName?: string;
  taxFreeAmount?: number;
  idempotencyKey?: string;
};

export type ChargeResult = {
  paymentKey: string;
  orderId: string;
  status: string; // "DONE" | "CANCELED" | "PARTIAL_CANCELED" | ...
  totalAmount: number;
  approvedAt?: string;
  card?: { number?: string; company?: string };
  raw: unknown;
};

export class TossConfigMissingError extends Error {
  code = "toss_config_missing" as const;
  constructor() {
    super("TOSS_SECRET_KEY is not configured on this deployment");
    this.name = "TossConfigMissingError";
  }
}

export class TossApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = "TossApiError";
  }
}

function secretHeader(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) throw new TossConfigMissingError();
  // Toss는 "<secret>:" 형태를 base64로 인코딩해 Basic Auth 헤더에 넣음.
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/** 클라이언트 SDK가 필요로 하는 public 키. 없으면 UI가 checkout 버튼을 disable. */
export function getPublicClientKey(): string | null {
  return process.env.TOSS_CLIENT_KEY ?? null;
}

/**
 * Toss success URL 콜백으로 받은 authKey + customerKey를 빌링키로 교환.
 * @throws TossConfigMissingError 시크릿 키 누락 시
 * @throws Error 네트워크/4xx/5xx 시
 */
export async function issueBillingKey(
  input: BillingKeyAuthorizeInput,
): Promise<BillingKeyAuthorizeResult> {
  const res = await fetch(`${API_BASE}/v1/billing/authorizations/issue`, {
    method: "POST",
    headers: {
      Authorization: secretHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authKey: input.authKey,
      customerKey: input.customerKey,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data.message as string) ?? `HTTP ${res.status}`;
    throw new Error(`toss issueBillingKey: ${msg}`);
  }
  return {
    billingKey: data.billingKey as string,
    customerKey: data.customerKey as string,
    cardCompany: data.cardCompany as string | undefined,
    cardNumber: data.cardNumber as string | undefined,
    method: data.method as string | undefined,
  };
}

/**
 * 저장된 빌링키로 즉시 결제를 실행. 최초 업그레이드 + 매달 갱신 모두 여기로.
 */
export async function chargeBillingKey(input: ChargeInput): Promise<ChargeResult> {
  const res = await fetch(
    `${API_BASE}/v1/billing/${encodeURIComponent(input.billingKey)}`,
    {
      method: "POST",
      headers: {
        Authorization: secretHeader(),
        "Content-Type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        customerKey: input.customerKey,
        amount: input.amount,
        orderId: input.orderId,
        orderName: input.orderName,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        taxFreeAmount: input.taxFreeAmount ?? 0,
      }),
    },
  );

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data.message as string) ?? `HTTP ${res.status}`;
    throw new TossApiError(
      `toss chargeBillingKey: ${msg}`,
      res.status,
      data.code as string | undefined,
    );
  }
  return {
    paymentKey: data.paymentKey as string,
    orderId: data.orderId as string,
    status: data.status as string,
    totalAmount: Number(data.totalAmount ?? 0),
    approvedAt: data.approvedAt as string | undefined,
    card: (data.card as ChargeResult["card"]) ?? undefined,
    raw: data,
  };
}


export type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  currency?: string;
  raw: Record<string, unknown>;
};

/** Authenticated provider lookup used for retry recovery and webhook trust. */
export async function getPaymentByOrderId(
  orderId: string,
): Promise<TossPayment | null> {
  const res = await fetch(
    `${API_BASE}/v1/payments/orders/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: secretHeader() } },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = (data.message as string) ?? `HTTP ${res.status}`;
    throw new TossApiError(
      `toss getPaymentByOrderId: ${msg}`,
      res.status,
      data.code as string | undefined,
    );
  }
  return {
    paymentKey: data.paymentKey as string,
    orderId: data.orderId as string,
    status: data.status as string,
    totalAmount: Number(data.totalAmount ?? 0),
    currency: data.currency as string | undefined,
    raw: data,
  };
}

/**
 * 결제 취소(환불). 전액 또는 부분. Toss /v1/payments/{paymentKey}/cancel.
 */
export type CancelInput = {
  paymentKey: string;
  cancelReason: string;
  cancelAmount?: number; // null = 전액
};

export type CancelResult = {
  paymentKey: string;
  status: string; // "CANCELED" | "PARTIAL_CANCELED"
  totalAmount: number;
  balanceAmount: number;
  canceledAmount: number;
  raw: unknown;
};

export async function cancelPayment(input: CancelInput): Promise<CancelResult> {
  const res = await fetch(
    `${API_BASE}/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: secretHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cancelReason: input.cancelReason,
        cancelAmount: input.cancelAmount,
      }),
    },
  );

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data.message as string) ?? `HTTP ${res.status}`;
    throw new Error(`toss cancelPayment: ${msg}`);
  }
  const cancels = (data.cancels as Array<Record<string, unknown>>) ?? [];
  const canceled = cancels.reduce(
    (sum, c) => sum + Number(c.cancelAmount ?? 0),
    0,
  );
  return {
    paymentKey: data.paymentKey as string,
    status: data.status as string,
    totalAmount: Number(data.totalAmount ?? 0),
    balanceAmount: Number(data.balanceAmount ?? 0),
    canceledAmount: canceled,
    raw: data,
  };
}

/** 플랜별 가격 (KRW, 세금 포함 가정). 차후 DB로 이전 가능. */
export const PLAN_CATALOG = {
  pro_monthly: {
    planKey: "pro_monthly" as const,
    label: "Pro · 월 구독",
    amount: 4900,
    periodDays: 30,
  },
  pro_yearly: {
    planKey: "pro_yearly" as const,
    label: "Pro · 연 구독",
    amount: 49000,
    periodDays: 365,
  },
} as const;

export type PlanKey = keyof typeof PLAN_CATALOG;
