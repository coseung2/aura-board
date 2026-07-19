import { afterEach, describe, expect, it, vi } from "vitest";
import { getUpstashRedisConfig } from "./upstash-env";

const ENV_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

function clearRedisEnv() {
  for (const key of ENV_KEYS) vi.stubEnv(key, "");
}

describe("getUpstashRedisConfig", () => {
  it("prefers a complete Upstash pair", () => {
    clearRedisEnv();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://upstash.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "upstash-token");
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");

    expect(getUpstashRedisConfig()).toEqual({
      url: "https://upstash.example",
      token: "upstash-token",
    });
  });

  it("falls back to one complete KV pair without mixing credentials", () => {
    clearRedisEnv();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://incomplete.example");
    vi.stubEnv("KV_REST_API_URL", "https://kv.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");

    expect(getUpstashRedisConfig()).toEqual({
      url: "https://kv.example",
      token: "kv-token",
    });
  });

  it("returns null when neither pair is complete", () => {
    clearRedisEnv();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://upstash.example");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");

    expect(getUpstashRedisConfig()).toBeNull();
  });
});
