import { afterEach, describe, expect, it, vi } from "vitest";
import { MockParentSecurityRedis } from "./__tests__/parent-security-redis.mock";

async function loadSignupLimitInstance(redis: MockParentSecurityRedis) {
  vi.resetModules();
  const store = await import("./parent-security-store");
  store._setParentSecurityRedisForTests(redis);
  return import("./parent-rate-limit");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("distributed parent signup failure limits", () => {
  it("shares failures across instances and never puts the raw IP in Redis", async () => {
    const redis = new MockParentSecurityRedis();
    const first = await loadSignupLimitInstance(redis);
    const second = await loadSignupLimitInstance(redis);

    for (let failure = 0; failure < 5; failure += 1) {
      await (failure % 2 === 0 ? first : second).recordIpFailure("198.51.100.7");
    }
    await expect(first.isIpLocked("198.51.100.7")).resolves.toBe(true);
    expect([...redis.windows.keys()][0]).not.toContain("198.51.100.7");
  });

  it("fails closed in production without Redis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const store = await import("./parent-security-store");
    store._setParentSecurityRedisForTests(null);
    const limits = await import("./parent-rate-limit");

    await expect(limits.isIpLocked("198.51.100.7")).rejects.toThrow(
      /Redis is not configured.*request denied/,
    );
  });
});
