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

function isAllowedOrigin(originHeader: string, requestUrl: string): boolean {
  try {
    const candidate = new URL(originHeader).origin;
    const allowed = new Set([
      new URL(requestUrl).origin,
      new URL(PUBLIC_ORIGIN).origin,
    ]);
    return allowed.has(candidate);
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
    return isAllowedOrigin(origin, req.url) ? { ok: true } : { ok: false, status: 403 };
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
