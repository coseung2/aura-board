import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { getUpstashRedisConfig } from "./upstash-env";

export type DistributedCooldownRedis = {
  set(
    key: string,
    value: string,
    options: { px: number; nx: true },
  ): Promise<"OK" | null>;
  pttl(key: string): Promise<number>;
  eval<T>(script: string, keys: string[], args: unknown[]): Promise<T>;
};

export type DistributedCooldownLease = {
  key: string;
  token: string;
  backend: "redis" | "memory";
};

export type DistributedCooldownClaim =
  | { ok: true; lease: DistributedCooldownLease }
  | { ok: false; retryAfter: number };

export class DistributedCooldownUnavailableError extends Error {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`Distributed cooldown ${operation} unavailable; request denied`, options);
    this.name = "DistributedCooldownUnavailableError";
  }
}

type MemoryLease = { token: string; expiresAt: number };

const memoryLeases = new Map<string, MemoryLease>();
let redis: DistributedCooldownRedis | null = null;
let testRedis: DistributedCooldownRedis | null | undefined;

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function configuredRedis(): DistributedCooldownRedis | null {
  if (testRedis !== undefined) return testRedis;
  if (redis) return redis;
  const config = getUpstashRedisConfig();
  if (!config) return null;
  redis = new Redis(config) as unknown as DistributedCooldownRedis;
  return redis;
}

function production(): boolean {
  return process.env.NODE_ENV === "production";
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function cooldownKey(namespace: string, identifiers: string[]): string {
  if (!namespace || !identifiers.length || identifiers.some((value) => !value)) {
    throw new Error("distributed cooldown requires a namespace and identifiers");
  }
  return `cooldown:${namespace}:${identifiers.map(hashIdentifier).join(":")}`;
}

function retryAfterFromTtl(ttlMs: number, fallbackMs: number): number {
  const effectiveTtl = ttlMs > 0 ? ttlMs : fallbackMs;
  return Math.max(1, Math.ceil(effectiveTtl / 1000));
}

function memoryClaim(key: string, token: string, ttlMs: number): DistributedCooldownClaim {
  const now = Date.now();
  const current = memoryLeases.get(key);
  if (current && current.expiresAt > now) {
    return {
      ok: false,
      retryAfter: retryAfterFromTtl(current.expiresAt - now, ttlMs),
    };
  }
  memoryLeases.set(key, { token, expiresAt: now + ttlMs });
  return { ok: true, lease: { key, token, backend: "memory" } };
}

async function redisClaim(
  client: DistributedCooldownRedis,
  key: string,
  token: string,
  ttlMs: number,
): Promise<DistributedCooldownClaim> {
  if ((await client.set(key, token, { px: ttlMs, nx: true })) === "OK") {
    return { ok: true, lease: { key, token, backend: "redis" } };
  }

  let ttl = await client.pttl(key);
  if (ttl <= 0 && (await client.set(key, token, { px: ttlMs, nx: true })) === "OK") {
    return { ok: true, lease: { key, token, backend: "redis" } };
  }
  if (ttl <= 0) ttl = await client.pttl(key);
  return { ok: false, retryAfter: retryAfterFromTtl(ttl, ttlMs) };
}

export async function claimDistributedCooldown(options: {
  namespace: string;
  identifiers: string[];
  ttlMs: number;
}): Promise<DistributedCooldownClaim> {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
    throw new Error("distributed cooldown ttlMs must be positive");
  }
  const key = cooldownKey(options.namespace, options.identifiers);
  const token = randomBytes(24).toString("hex");
  const client = configuredRedis();

  if (client) {
    try {
      return await redisClaim(client, key, token, options.ttlMs);
    } catch (cause) {
      if (production()) {
        throw new DistributedCooldownUnavailableError("claim", { cause });
      }
      console.warn("[distributed-cooldown] Redis claim failed; using local memory", cause);
      return memoryClaim(key, token, options.ttlMs);
    }
  }
  if (production()) throw new DistributedCooldownUnavailableError("claim");
  return memoryClaim(key, token, options.ttlMs);
}

export async function releaseDistributedCooldown(
  lease: DistributedCooldownLease,
): Promise<boolean> {
  if (lease.backend === "memory") {
    const current = memoryLeases.get(lease.key);
    if (!current || current.token !== lease.token) return false;
    memoryLeases.delete(lease.key);
    return true;
  }

  const client = configuredRedis();
  if (client) {
    try {
      return (await client.eval<number>(RELEASE_SCRIPT, [lease.key], [lease.token])) === 1;
    } catch (cause) {
      if (production()) {
        throw new DistributedCooldownUnavailableError("release", { cause });
      }
      console.warn("[distributed-cooldown] Redis release failed", cause);
      return false;
    }
  }
  if (production()) throw new DistributedCooldownUnavailableError("release");

  return false;
}

export function _setDistributedCooldownRedisForTests(
  client: DistributedCooldownRedis | null | undefined,
): void {
  testRedis = client;
  redis = null;
}

export function _resetDistributedCooldownForTests(): void {
  memoryLeases.clear();
  testRedis = undefined;
  redis = null;
}
