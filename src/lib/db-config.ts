const DEFAULT_CONNECTION_LIMIT = 15;
const DEFAULT_POOL_TIMEOUT_SECONDS = 30;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function applicationConnectionLimit(): number {
  return positiveInteger(
    process.env.PRISMA_CONNECTION_LIMIT,
    DEFAULT_CONNECTION_LIMIT,
  );
}

export function applicationPoolTimeoutSeconds(): number {
  return positiveInteger(
    process.env.PRISMA_POOL_TIMEOUT_SECONDS,
    DEFAULT_POOL_TIMEOUT_SECONDS,
  );
}

export function withApplicationPoolLimits(
  url: string | undefined,
): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("postgres")) return url;
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set(
        "connection_limit",
        String(applicationConnectionLimit()),
      );
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set(
        "pool_timeout",
        String(applicationPoolTimeoutSeconds()),
      );
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
