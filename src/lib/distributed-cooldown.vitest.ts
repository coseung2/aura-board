import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetDistributedCooldownForTests,
  _setDistributedCooldownRedisForTests,
  claimDistributedCooldown,
  DistributedCooldownUnavailableError,
  releaseDistributedCooldown,
  type DistributedCooldownRedis,
} from "./distributed-cooldown";

class MockCooldownRedis implements DistributedCooldownRedis {
  private values = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, options: { px: number; nx: true }) {
    const current = this.values.get(key);
    if (current && current.expiresAt > Date.now()) return null;
    this.values.set(key, { value, expiresAt: Date.now() + options.px });
    return "OK" as const;
  }

  async pttl(key: string) {
    const current = this.values.get(key);
    return current ? Math.max(-1, current.expiresAt - Date.now()) : -2;
  }

  async eval<T>(_script: string, keys: string[], args: unknown[]) {
    const current = this.values.get(keys[0]);
    if (!current || current.value !== args[0]) return 0 as T;
    this.values.delete(keys[0]);
    return 1 as T;
  }

  keys() {
    return [...this.values.keys()];
  }
}

const options = {
  namespace: "assignment-reminder",
  identifiers: ["board-raw", "teacher-raw"],
  ttlMs: 300_000,
};

describe("distributed cooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    _resetDistributedCooldownForTests();
  });

  afterEach(() => {
    _resetDistributedCooldownForTests();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("atomically allows only one concurrent claim and hashes identifiers", async () => {
    const redis = new MockCooldownRedis();
    _setDistributedCooldownRedisForTests(redis);

    const claims = await Promise.all([
      claimDistributedCooldown(options),
      claimDistributedCooldown(options),
    ]);

    expect(claims.filter((claim) => claim.ok)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.ok)).toHaveLength(1);
    expect(redis.keys()[0]).not.toContain("board-raw");
    expect(redis.keys()[0]).not.toContain("teacher-raw");
  });

  it("returns retry-after from the remaining distributed TTL", async () => {
    _setDistributedCooldownRedisForTests(new MockCooldownRedis());
    expect((await claimDistributedCooldown(options)).ok).toBe(true);
    vi.advanceTimersByTime(61_000);

    const denied = await claimDistributedCooldown(options);

    expect(denied).toEqual({ ok: false, retryAfter: 239 });
  });

  it("releases only the matching lease token", async () => {
    _setDistributedCooldownRedisForTests(new MockCooldownRedis());
    const claim = await claimDistributedCooldown(options);
    if (!claim.ok) throw new Error("claim unexpectedly denied");

    expect(
      await releaseDistributedCooldown({ ...claim.lease, token: "wrong-token" }),
    ).toBe(false);
    expect((await claimDistributedCooldown(options)).ok).toBe(false);
    expect(await releaseDistributedCooldown(claim.lease)).toBe(true);
    expect((await claimDistributedCooldown(options)).ok).toBe(true);
  });

  it("fails closed in production when Redis is missing or fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    _setDistributedCooldownRedisForTests(null);
    await expect(claimDistributedCooldown(options)).rejects.toBeInstanceOf(
      DistributedCooldownUnavailableError,
    );

    _setDistributedCooldownRedisForTests({
      set: vi.fn().mockRejectedValue(new Error("offline")),
      pttl: vi.fn(),
      eval: vi.fn(),
    });
    await expect(claimDistributedCooldown(options)).rejects.toBeInstanceOf(
      DistributedCooldownUnavailableError,
    );
  });
});
