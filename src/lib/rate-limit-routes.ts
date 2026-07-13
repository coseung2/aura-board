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
  failClosed = false,
): Promise<LimitVerdict> {
  if (HAS_UPSTASH) {
    try {
      const r = await upstashLimiter(prefix, limit, window).limit(id);
      const retryAfter = Math.max(0, Math.ceil((r.reset - Date.now()) / 1000));
      return { ok: r.success, retryAfter: retryAfter || 1 };
    } catch (err) {
      console.warn(`[rate-limit-routes:${prefix}] upstash failed — fallback`, err);
      if (failClosed || process.env.RL_FAIL_MODE === "close") {
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

/** Canva metadata/folder reads — 교사 1인당 분당 120회. */
export function limitCanvaRead(userId: string): Promise<LimitVerdict> {
  return runLimit("rl:canva-read", userId, 120, "60 s");
}

/** Canva folder creation/move — 교사 1인당 분당 30회. */
export function limitCanvaMutation(userId: string): Promise<LimitVerdict> {
  return runLimit("rl:canva-mutation", userId, 30, "60 s");
}

/** Canva PDF export — 교사 1인당 분당 10회. */
export function limitCanvaExport(userId: string): Promise<LimitVerdict> {
  return runLimit("rl:canva-export", userId, 10, "60 s");
}

/** Canva review credentials: independent IP and account limits, both fail-closed. */
export async function limitCanvaReviewerLogin(
  ipKey: string,
  accountKey: string,
): Promise<LimitVerdict> {
  const [ip, account] = await Promise.all([
    runLimit("rl:canva-reviewer-login:ip", ipKey, 20, "1 h", true),
    runLimit("rl:canva-reviewer-login:account", accountKey, 10, "1 h", true),
  ]);
  if (!ip.ok) return ip;
  return account;
}
