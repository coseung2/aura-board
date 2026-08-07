const MOBILE_CAPABILITY_HEADER = "x-aura-mobile-capabilities";
const MAX_CREDENTIAL_BODY_BYTES = 2_048;

export type CredentialRequestVerdict =
  | { ok: true }
  | { ok: false; status: 400 | 403 };

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
    try {
      return new URL(origin).origin === new URL(req.url).origin
        ? { ok: true }
        : { ok: false, status: 403 };
    } catch {
      return { ok: false, status: 403 };
    }
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
