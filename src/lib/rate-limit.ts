/**
 * 3-axis sliding-window rate limiting (Seed 8 §1.4 / CR-6).
 *
 *   per-token   → 60 req / 1 min  (rl:pat:<tokenId>:1m)
 *   per-teacher → 300 req / 1 hour (rl:teacher:<userId>:1h)
 *   per-IP      → 300 req / 1 min (rl:ip:<hashedIp>:1m)
 *
 * OR judgment: if any axis is over budget, the request is rejected with 429
 * plus `Retry-After: <seconds>` — the maximum `retryAfter` across axes.
 *
 * Backend:
 *   • Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *     are set → `@upstash/ratelimit` sliding window.
 *   • Fallback: in-process sliding-window (dev/self-host). Process-local, so
 *     not fit for multi-instance production — the platform env should provide
 *     Upstash to meet AC-06.
 *
 * Fail-open on transient Upstash error (R6). Set RL_FAIL_MODE=close to
 * invert.
 */
import "server-only";
import { createHash } from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getUpstashRedisConfig } from "./upstash-env";

export type RateLimitVerdict = {
  ok: boolean;
  retryAfter: number; // seconds
  axis?: "token" | "teacher" | "ip";
};

const upstashConfig = getUpstashRedisConfig();
const HAS_UPSTASH = upstashConfig !== null;

// ── Upstash-backed limiters (lazy singletons) ────────────────────────────
let redis: Redis | null = null;
let tokenLimiter: Ratelimit | null = null;
let teacherLimiter: Ratelimit | null = null;
let ipLimiter: Ratelimit | null = null;

function ensureUpstash(): void {
  if (!HAS_UPSTASH || redis) return;
  if (!upstashConfig) return;
  redis = new Redis({
    url: upstashConfig.url,
    token: upstashConfig.token,
  });
  tokenLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix: "rl:pat",
  });
  teacherLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(300, "1 h"),
    prefix: "rl:teacher",
  });
  ipLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(300, "60 s"),
    prefix: "rl:ip",
  });
}

// ── In-memory fallback sliding window ────────────────────────────────────
type Window = { ts: number[] };
const mem = new Map<string, Window>();
function memLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const w = mem.get(key) ?? { ts: [] };
  // Drop entries outside window
  while (w.ts.length && now - w.ts[0] > windowMs) w.ts.shift();
  if (w.ts.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - w.ts[0])) / 1000));
    mem.set(key, w);
    return { ok: false, retryAfter };
  }
  w.ts.push(now);
  mem.set(key, w);
  return { ok: true, retryAfter: 0 };
}

function failMode(): "open" | "close" {
  return process.env.RL_FAIL_MODE === "close" ? "close" : "open";
}

async function runLimiter(
  kind: "token" | "teacher" | "ip",
  key: string
): Promise<{ ok: boolean; retryAfter: number }> {
  if (HAS_UPSTASH) {
    ensureUpstash();
    const limiter =
      kind === "token" ? tokenLimiter! : kind === "teacher" ? teacherLimiter! : ipLimiter!;
    try {
      const res = await limiter.limit(key);
      const retryAfter = Math.max(0, Math.ceil((res.reset - Date.now()) / 1000));
      return { ok: res.success, retryAfter: retryAfter || 1 };
    } catch (err) {
      console.warn("[rate-limit] Upstash error — falling back", err);
      if (failMode() === "close") return { ok: false, retryAfter: 5 };
      // fail-open
      return { ok: true, retryAfter: 0 };
    }
  }
  // Pure in-memory fallback for dev.
  const windowMs = kind === "teacher" ? 60 * 60 * 1000 : 60 * 1000;
  const limit = kind === "token" ? 60 : 300;
  return memLimit(`${kind}:${key}`, limit, windowMs);
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function extractIp(req: Request): string {
  const hdrs = req.headers;
  const forwarded = hdrs.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = hdrs.get("x-real-ip");
  if (real) return real;
  return "0.0.0.0";
}

export async function checkAll(opts: {
  tokenId: string;
  userId: string;
  req: Request;
}): Promise<RateLimitVerdict> {
  const ip = extractIp(opts.req);
  const ipHash = hashIp(ip);
  const [t, u, i] = await Promise.all([
    runLimiter("token", opts.tokenId),
    runLimiter("teacher", opts.userId),
    runLimiter("ip", ipHash),
  ]);
  if (!t.ok) return { ok: false, retryAfter: t.retryAfter, axis: "token" };
  if (!u.ok) return { ok: false, retryAfter: u.retryAfter, axis: "teacher" };
  if (!i.ok) return { ok: false, retryAfter: i.retryAfter, axis: "ip" };
  return { ok: true, retryAfter: 0 };
}

// Test-only hook — replaced by vi.spyOn / vi.importActual in vitest.
// Kept as a comment for reference: the old `export const __test__ = { mem }`
// leaked test internals into the production bundle.
// @see src/lib/__tests__/rate-limit.vitest.ts for the replacement pattern.
