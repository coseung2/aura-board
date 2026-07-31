import { afterEach, describe, expect, it, vi } from "vitest";
import { MockParentSecurityRedis } from "./__tests__/parent-security-redis.mock";

async function loadRateLimitInstance(redis: MockParentSecurityRedis) {
  vi.resetModules();
  const store = await import("./parent-security-store");
  store._setParentSecurityRedisForTests(redis);
  return import("./rate-limit-parent");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("distributed parent match rate limits", () => {
  it("shares the 5/15m IP limit across module instances and returns retry-after", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00Z"));
    const redis = new MockParentSecurityRedis();
    const first = await loadRateLimitInstance(redis);
    const second = await loadRateLimitInstance(redis);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const limiter = attempt % 2 === 0 ? first : second;
      await expect(limiter.checkMatchLimit("203.0.113.9", null, null)).resolves.toEqual({ ok: true });
    }
    await expect(second.checkMatchLimit("203.0.113.9", null, null)).resolves.toEqual({
      ok: false,
      axis: "ip",
      retryAfterSec: 900,
    });
    expect([...redis.windows.keys()][0]).not.toContain("203.0.113.9");
  });

  it("hashes invite codes and emails and preserves the rejection cooldown", async () => {
    const redis = new MockParentSecurityRedis();
    const limits = await loadRateLimitInstance(redis);
    await limits.checkMatchLimit(null, "SECRET-CODE", "classroom-1");
    await limits.recordRejection("Parent@Example.com");
    await limits.recordRejection("parent@example.com");
    await limits.recordRejection("parent@example.com");

    await expect(limits.checkRejectionCooldown("PARENT@example.com")).resolves.toMatchObject({
      ok: false,
      retryAfterSec: 86_400,
    });
    const keys = [...redis.windows.keys()].join(" ");
    expect(keys).not.toContain("SECRET-CODE");
    expect(keys).not.toContain("parent@example.com");
  });
});
