const MOBILE_CAPABILITY_HEADER = "x-aura-mobile-capabilities";
const MAX_CREDENTIAL_BODY_BYTES = 2_048;

// Next.js standalone builds req.url from the server's bind address
// (localhost:3000) instead of the public Host header, so a same-origin check
// against req.url alone rejects every browser write behind nginx. Accept the
// configured public origin as well; local development still matches through
// req.url's own origin.
const PUBLIC_ORIGIN = (
  process.env.AURA_BOARD_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_BASE_URL ??
  "https://aura-board.com"
).trim();

export type CredentialRequestVerdict =
  | { ok: true }
  | { ok: false; status: 400 | 403 };

function isAllowedOrigin(originHeader: string, req: Request): boolean {
  try {
    const candidateUrl = new URL(originHeader);
    const requestOriginUrl = new URL(req.url);
    const candidate = candidateUrl.origin;
    const allowed = new Set([
      requestOriginUrl.origin,
      new URL(PUBLIC_ORIGIN).origin,
    ]);

    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const host = forwardedHost || req.headers.get("host")?.trim();
    if (host) {
      const forwardedProto = req.headers
        .get("x-forwarded-proto")
        ?.split(",", 1)[0]
        ?.trim();
      const protocol = forwardedProto || requestOriginUrl.protocol.slice(0, -1);
      allowed.add(new URL(`${protocol}://${host}`).origin);
    }

    if (allowed.has(candidate)) return true;

    // Next dev can receive a browser request through localhost while exposing
    // req.url as 127.0.0.1 (or the reverse). Treat only same-port HTTP
    // loopback aliases as the same development origin.
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return (
      candidateUrl.protocol === "http:" &&
      requestOriginUrl.protocol === "http:" &&
      loopbackHosts.has(candidateUrl.hostname) &&
      loopbackHosts.has(requestOriginUrl.hostname) &&
      candidateUrl.port === requestOriginUrl.port
    );
  } catch {
    return false;
  }
}

/** Browser writes must be same-origin; native writes use a non-simple header. */
export function validateCredentialRequest(req: Request): CredentialRequestVerdict {
  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { ok: false, status: 400 };

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_CREDENTIAL_BODY_BYTES) {
    return { ok: false, status: 400 };
  }

  const origin = req.headers.get("origin");
  if (origin) {
    return isAllowedOrigin(origin, req) ? { ok: true } : { ok: false, status: 403 };
  }

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin"
      ? { ok: true }
      : { ok: false, status: 403 };
  }

  return req.headers.has(MOBILE_CAPABILITY_HEADER)
    ? { ok: true }
    : { ok: false, status: 403 };
}
