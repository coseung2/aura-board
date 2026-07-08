// Route-specific rate limiters (Seed 14 security, 2026-04-22).
// Hot internal routes가 per-user 또는 per-student 기반으로 분당/시간당 상한을
// 걸도록. Upstash 있으면 sliding window, 없으면 in-memory fallback.
//
// 사용:
//   const v = await limitVibeSession(studentId);
//   if (!v.ok) return 429 with Retry-After: v.retryAfter;
//
// fail-open 기본. RL_FAIL_MODE=close 이면 Upstash 장애 시 거절.

import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type LimitVerdict = { ok: boolean; retryAfter: number };

const HAS_UPSTASH = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

let redis: Redis | null = null;
function getRedis(): Redis {
  if (redis) return redis;
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return redis;
}

type WindowKey = "60 s" | "10 s" | "1 h" | "1 d";

/** Upstash Ratelimit lazy singleton per (prefix, limit, window). */
const upstashCache = new Map<string, Ratelimit>();
function upstashLimiter(
  prefix: string,
  limit: number,
  window: WindowKey,
): Ratelimit {
  const key = `${prefix}:${limit}:${window}`;
  let l = upstashCache.get(key);
  if (!l) {
    l = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix,
    });
    upstashCache.set(key, l);
  }
  return l;
}

/** In-memory fallback sliding window (dev only). */
type MemWindow = { ts: number[] };
const memStore = new Map<string, MemWindow>();
function memSlidingWindow(
  key: string,
  limit: number,
  windowMs: number,
): LimitVerdict {
  const now = Date.now();
  const w = memStore.get(key) ?? { ts: [] };
  while (w.ts.length && now - w.ts[0] > windowMs) w.ts.shift();
  if (w.ts.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - w.ts[0])) / 1000));
    memStore.set(key, w);
    return { ok: false, retryAfter };
  }
  w.ts.push(now);
  memStore.set(key, w);
  return { ok: true, retryAfter: 0 };
}

function windowToMs(w: WindowKey): number {
  switch (w) {
    case "10 s":
      return 10_000;
    case "60 s":
      return 60_000;
    case "1 h":
      return 60 * 60_000;
    case "1 d":
      return 24 * 60 * 60_000;
  }
}

async function runLimit(
  prefix: string,
  id: string,
  limit: number,
  window: WindowKey,
): Promise<LimitVerdict> {
  if (HAS_UPSTASH) {
    try {
      const r = await upstashLimiter(prefix, limit, window).limit(id);
      const retryAfter = Math.max(0, Math.ceil((r.reset - Date.now()) / 1000));
      return { ok: r.success, retryAfter: retryAfter || 1 };
    } catch (err) {
      console.warn(`[rate-limit-routes:${prefix}] upstash failed — fallback`, err);
      if (process.env.RL_FAIL_MODE === "close") {
        return { ok: false, retryAfter: 5 };
      }
      return { ok: true, retryAfter: 0 };
    }
  }
  return memSlidingWindow(
    `${prefix}:${id}`,
    limit,
    windowToMs(window),
  );
}

// ───── 노출된 limiter들 — 각 route의 성격에 맞춰 prefix/limit/window 지정 ─────

/** 학생 1인의 vibe-arcade 프롬프트 호출 — 분당 30회 (Gemini RPM 15 기본 대비 여유). */
export function limitVibeSession(studentId: string): Promise<LimitVerdict> {
  return runLimit("rl:vibe-session", studentId, 30, "60 s");
}

/** 교사 1인의 LLM Key 저장·삭제 — 분당 10회 (검증 spam 방지). */
export function limitLlmKeyMutation(userId: string): Promise<LimitVerdict> {
  return runLimit("rl:llm-key", userId, 10, "60 s");
}

/** 교사 1인의 결제 시작(checkout) — 분당 10회. */
export function limitBillingCheckout(userId: string): Promise<LimitVerdict> {
  return runLimit("rl:billing-checkout", userId, 10, "60 s");
}

/** 교사 1인의 환불 요청 — 시간당 5회. 부정환불 탐색 방지. */
export function limitBillingRefund(userId: string): Promise<LimitVerdict> {
  return runLimit("rl:billing-refund", userId, 5, "1 h");
}

/**
 * student-auth-fail-closed: 학급 단위 코드 로그인 스파이크 / 단일 IP
 * bruteforce를 동시에 막기 위해 IP 축과 정규화된 토큰/코드 축을 모두
 * 검사한다. 둘 중 하나라도 한도 초과면 429. 학교/학원 NAT 환경에서
 * 수십 명이 같은 공인 IP로 동시에 들어올 수 있으므로 IP 축은 넉넉하게
 * 두고, 코드/토큰 축으로 bruteforce를 더 강하게 잡는다. 둘 중 어느 축이
 * 먼저 닫혔는지는 `axis`로 함께 반환해 로그를 남길 수 있게 한다.
 */
export async function limitStudentAuth(opts: {
  ipKey: string;
  tokenKey: string;
}): Promise<LimitVerdict & { axis?: "ip" | "token" }> {
  // 400-student rollout: school NAT can collapse a whole cohort to one IP.
  const [ip, token] = await Promise.all([
    runLimit("rl:student-auth:ip", opts.ipKey, 900, "60 s"),
    runLimit("rl:student-auth:token", opts.tokenKey, 50, "60 s"),
  ]);
  if (!ip.ok) return { ok: false, retryAfter: ip.retryAfter, axis: "ip" };
  if (!token.ok) {
    return { ok: false, retryAfter: token.retryAfter, axis: "token" };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * upload-server-cap-4mb: 업로드 라우트는 인증된 사용자/학생 단위와
 * IP 단위 모두에서 상한을 둔다. actor 축은 분당 20회로 좁게 막고,
 * 400+ 학생이 같은 학교 NAT에 묶일 수 있어 IP 축은 분당 900회로 둔다.
 */
export async function limitUpload(opts: {
  actorKey: string;
  ipKey: string;
}): Promise<LimitVerdict & { axis?: "actor" | "ip" }> {
  // 400-student rollout: keep the IP axis broad; actor axis catches spam.
  const [actor, ip] = await Promise.all([
    runLimit("rl:upload:actor", opts.actorKey, 20, "60 s"),
    runLimit("rl:upload:ip", opts.ipKey, 900, "60 s"),
  ]);
  if (!actor.ok) {
    return { ok: false, retryAfter: actor.retryAfter, axis: "actor" };
  }
  if (!ip.ok) {
    return { ok: false, retryAfter: ip.retryAfter, axis: "ip" };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Per-student speed-game answer throttle. Keep the IP axis out of this one:
 * a whole classroom can share one school NAT while each student should only
 * need a handful of answer attempts per minute.
 */
export function limitSpeedGameAnswer(studentGameKey: string): Promise<LimitVerdict> {
  return runLimit("rl:speed-game:answer", studentGameKey, 30, "60 s");
}
