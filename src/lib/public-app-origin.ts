const DEFAULT_PUBLIC_APP_ORIGIN = "https://aura-board.com";

type HeaderReader = Pick<Headers, "get">;

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

function normalizeHttpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

export function configuredPublicAppOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return normalizeHttpOrigin(
    env.AURA_BOARD_BASE_URL?.trim() || env.NEXT_PUBLIC_APP_BASE_URL?.trim(),
  );
}

export function publicAppOriginFromHeaders(
  requestHeaders: HeaderReader,
  fallbackOrigin = DEFAULT_PUBLIC_APP_ORIGIN,
): string {
  const configured = configuredPublicAppOrigin();
  if (configured) return configured;

  const fallback = normalizeHttpOrigin(fallbackOrigin) ?? DEFAULT_PUBLIC_APP_ORIGIN;
  const forwardedHost = firstHeaderValue(requestHeaders.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(requestHeaders.get("host"));
  if (!host) return fallback;

  const forwardedProto = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const fallbackProtocol = new URL(fallback).protocol.slice(0, -1);
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : isLoopbackHost(host)
        ? "http"
        : fallbackProtocol;

  return normalizeHttpOrigin(`${protocol}://${host}`) ?? fallback;
}

export function requestPublicAppOrigin(request: Request): string {
  return publicAppOriginFromHeaders(request.headers, new URL(request.url).origin);
}
