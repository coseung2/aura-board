import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

function clearRedisEnv() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
}

describe("limitSpeedGameAnswer", () => {
  it("limits each student and game pair to 30 answers per minute in development", async () => {
    clearRedisEnv();
    vi.stubEnv("NODE_ENV", "development");
    const { limitSpeedGameAnswer } = await import("./rate-limit-routes");

    for (let index = 0; index < 30; index += 1) {
      await expect(limitSpeedGameAnswer("game-a", "student-a")).resolves.toMatchObject({
        ok: true,
      });
    }
    await expect(limitSpeedGameAnswer("game-a", "student-a")).resolves.toMatchObject({
      ok: false,
    });
    await expect(limitSpeedGameAnswer("game-b", "student-a")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("fails closed in production when distributed limiting is unavailable", async () => {
    clearRedisEnv();
    vi.stubEnv("NODE_ENV", "production");
    const { limitSpeedGameAnswer } = await import("./rate-limit-routes");

    await expect(limitSpeedGameAnswer("game", "student")).resolves.toEqual({
      ok: false,
      retryAfter: 5,
    });
  });
});
