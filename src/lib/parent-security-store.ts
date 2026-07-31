import "server-only";
import { createHash, randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import { getUpstashRedisConfig } from "./upstash-env";

type Script<TResult> = {
  eval(keys: string[], args: string[]): Promise<TResult>;
};

export type ParentSecurityRedis = {
  get<TData = string>(key: string): Promise<TData | null>;
  set(
    key: string,
    value: string,
    options: { ex: number; nx: true },
  ): Promise<"OK" | null>;
  createScript<TResult = unknown>(script: string): Script<TResult>;
};

export class ParentSecurityOperationalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ParentSecurityOperationalError";
  }
}

type MemoryValue = { value: string; expiresAt: number };
const memoryValues = new Map<string, MemoryValue>();
const memoryWindows = new Map<string, number[]>();

let redis: ParentSecurityRedis | null = null;
let testRedis: ParentSecurityRedis | null | undefined;

function configuredRedis(): ParentSecurityRedis | null {
  if (testRedis !== undefined) return testRedis;
  if (redis) return redis;
  const config = getUpstashRedisConfig();
  if (!config) return null;
  redis = new Redis(config) as unknown as ParentSecurityRedis;
  return redis;
}

async function run<T>(
  operation: string,
  redisOperation: (client: ParentSecurityRedis) => Promise<T>,
  memoryOperation: () => T,
): Promise<T> {
  const client = configuredRedis();
  if (client) {
    try {
      return await redisOperation(client);
    } catch (cause) {
      if (process.env.NODE_ENV === "production") {
        throw new ParentSecurityOperationalError(
          `Parent security Redis ${operation} failed; request denied`,
          { cause },
        );
      }
      console.warn(`[parent-security] Redis ${operation} failed; using local memory`, cause);
      return memoryOperation();
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new ParentSecurityOperationalError(
      `Parent security Redis is not configured for ${operation}; request denied`,
    );
  }
  return memoryOperation();
}

export function sensitiveKey(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${prefix}:${digest}`;
}

export async function setExpiringValue(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<boolean> {
  return run(
    "SET",
    async (client) => (await client.set(key, value, { ex: ttlSeconds, nx: true })) === "OK",
    () => {
      const current = memoryValues.get(key);
      if (current && current.expiresAt > Date.now()) return false;
      memoryValues.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return true;
    },
  );
}

export async function readBoundValue(key: string, binding: string): Promise<string | null> {
  const expectedPrefix = `${binding}:`;
  return run(
    "GET",
    async (client) => {
      const value = await client.get<string>(key);
      return typeof value === "string" && value.startsWith(expectedPrefix)
        ? value.slice(expectedPrefix.length)
        : null;
    },
    () => {
      const current = memoryValues.get(key);
      if (!current || current.expiresAt <= Date.now()) {
        memoryValues.delete(key);
        return null;
      }
      return current.value.startsWith(expectedPrefix)
        ? current.value.slice(expectedPrefix.length)
        : null;
    },
  );
}

const CONSUME_BOUND_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then return false end
local expected = ARGV[1]
if string.sub(value, 1, string.len(expected)) ~= expected then return false end
redis.call("DEL", KEYS[1])
return string.sub(value, string.len(expected) + 1)
`;

export async function consumeBoundValue(
  key: string,
  binding: string,
): Promise<string | null> {
  const expectedPrefix = `${binding}:`;
  return run(
    "atomic consume",
    async (client) => {
      const value = await client
        .createScript<string | null>(CONSUME_BOUND_SCRIPT)
        .eval([key], [expectedPrefix]);
      return typeof value === "string" ? value : null;
    },
    () => {
      const current = memoryValues.get(key);
      if (
        !current ||
        current.expiresAt <= Date.now() ||
        !current.value.startsWith(expectedPrefix)
      ) {
        if (current && current.expiresAt <= Date.now()) memoryValues.delete(key);
        return null;
      }
      memoryValues.delete(key);
      return current.value.slice(expectedPrefix.length);
    },
  );
}

export type SlidingWindowVerdict = { ok: boolean; retryAfterSec: number };

const CHECK_WINDOW_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
local count = redis.call("ZCARD", KEYS[1])
if count == 0 then return {1, 0} end
redis.call("PEXPIRE", KEYS[1], window)
if count < limit then return {1, 0} end
local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
local retry = math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
return {0, retry}
`;

const RECORD_WINDOW_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
redis.call("ZADD", KEYS[1], now, ARGV[3])
redis.call("PEXPIRE", KEYS[1], window)
return redis.call("ZCARD", KEYS[1])
`;

const CONSUME_WINDOW_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
local count = redis.call("ZCARD", KEYS[1])
if count >= limit then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  redis.call("PEXPIRE", KEYS[1], window)
  local retry = math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
  return {0, retry}
end
redis.call("ZADD", KEYS[1], now, ARGV[4])
redis.call("PEXPIRE", KEYS[1], window)
return {1, 0}
`;

function trimMemoryWindow(key: string, now: number, windowMs: number): number[] {
  const hits = (memoryWindows.get(key) ?? []).filter((timestamp) => timestamp > now - windowMs);
  if (hits.length) memoryWindows.set(key, hits);
  else memoryWindows.delete(key);
  return hits;
}

function verdict(result: number[]): SlidingWindowVerdict {
  return { ok: result[0] === 1, retryAfterSec: Math.max(0, result[1] ?? 0) };
}

export async function checkSlidingWindow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<SlidingWindowVerdict> {
  const now = Date.now();
  return run(
    "rate-limit check",
    async (client) => verdict(await client.createScript<number[]>(CHECK_WINDOW_SCRIPT).eval(
      [key],
      [String(now), String(windowMs), String(limit)],
    )),
    () => {
      const hits = trimMemoryWindow(key, now, windowMs);
      if (hits.length < limit) return { ok: true, retryAfterSec: 0 };
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
      };
    },
  );
}

export async function recordSlidingWindow(key: string, windowMs: number): Promise<void> {
  const now = Date.now();
  const member = `${now}:${randomBytes(12).toString("hex")}`;
  await run(
    "rate-limit record",
    async (client) => {
      await client.createScript<number>(RECORD_WINDOW_SCRIPT).eval(
        [key],
        [String(now), String(windowMs), member],
      );
    },
    () => {
      const hits = trimMemoryWindow(key, now, windowMs);
      hits.push(now);
      memoryWindows.set(key, hits);
    },
  );
}

export async function consumeSlidingWindow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<SlidingWindowVerdict> {
  const now = Date.now();
  const member = `${now}:${randomBytes(12).toString("hex")}`;
  return run(
    "atomic rate-limit consume",
    async (client) => verdict(await client.createScript<number[]>(CONSUME_WINDOW_SCRIPT).eval(
      [key],
      [String(now), String(windowMs), String(limit), member],
    )),
    () => {
      const hits = trimMemoryWindow(key, now, windowMs);
      if (hits.length >= limit) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
        };
      }
      hits.push(now);
      memoryWindows.set(key, hits);
      return { ok: true, retryAfterSec: 0 };
    },
  );
}

export function _setParentSecurityRedisForTests(
  client: ParentSecurityRedis | null | undefined,
): void {
  testRedis = client;
  redis = null;
}

export function _resetParentSecurityStoreForTests(): void {
  memoryValues.clear();
  memoryWindows.clear();
  testRedis = undefined;
  redis = null;
}
