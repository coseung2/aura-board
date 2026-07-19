export type UpstashRedisConfig = {
  url: string;
  token: string;
};

/** Select one complete credential pair without mixing providers. */
export function getUpstashRedisConfig(): UpstashRedisConfig | null {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken };
  }

  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (kvUrl && kvToken) {
    return { url: kvUrl, token: kvToken };
  }

  return null;
}
