import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Card QR token — fixed HMAC-signed payload.
 *
 * Format: `card.${cardId}.${signature}`
 *  - cardId: the StudentCard row we're authenticating to
 *  - signature: HMAC(cardSecret + AUTH_SECRET, `card.fixed.${cardId}`)
 *
 * The QR functions like a physical card credential. Charge requests remain
 * atomic on the account/store transaction path; rotating/revoking the card's
 * qrSecret or status is the server-side way to invalidate the printed QR.
 *
 * The verifier still accepts the previous daily token format for a short
 * migration window so already-open wallet screens do not break mid-session.
 */

const AUTH_SECRET = process.env.AUTH_SECRET ?? "dev-secret-never-in-prod";

function signFixedInput(cardId: string, cardSecret: string): string {
  return createHmac("sha256", `${AUTH_SECRET}:${cardSecret}`)
    .update(`card.fixed.${cardId}`)
    .digest("base64url");
}

function signLegacyDailyInput(
  cardId: string,
  nonce: string,
  expiresAt: number,
  cardSecret: string
): string {
  return createHmac("sha256", `${AUTH_SECRET}:${cardSecret}`)
    .update(`${cardId}.${nonce}.${expiresAt}`)
    .digest("base64url");
}

export function issueCardToken(cardId: string, cardSecret: string): {
  token: string;
  expiresAt: null;
} {
  const sig = signFixedInput(cardId, cardSecret);
  const token = `card.${cardId}.${sig}`;
  return { token, expiresAt: null };
}

export type VerifiedCardToken = {
  cardId: string;
  kind: "fixed" | "legacy-daily";
  nonce: string | null;
  expiresAt: number | null;
};

export function parseCardToken(token: string): VerifiedCardToken | null {
  const parts = token.split(".");
  if (parts.length === 3 && parts[0] === "card") {
    const [, cardId] = parts;
    if (!cardId) return null;
    return { cardId, kind: "fixed", nonce: null, expiresAt: null };
  }

  if (parts.length !== 4) return null;
  const [cardId, nonce, expiresAtRaw] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return null;
  if (!cardId || !nonce) return null;
  return { cardId, kind: "legacy-daily", nonce, expiresAt };
}

export function getCardIdFromToken(token: string): string | null {
  return parseCardToken(token)?.cardId ?? null;
}

export function verifyCardToken(token: string, cardSecret: string): VerifiedCardToken | null {
  const parsed = parseCardToken(token);
  if (!parsed) return null;
  const parts = token.split(".");
  const sig = parsed.kind === "fixed" ? parts[2] : parts[3];
  const expected =
    parsed.kind === "fixed"
      ? signFixedInput(parsed.cardId, cardSecret)
      : signLegacyDailyInput(parsed.cardId, parsed.nonce ?? "", parsed.expiresAt ?? 0, cardSecret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  if (parsed.expiresAt !== null && parsed.expiresAt < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return parsed;
}

/** 4-digit blocks like "5501-1234". Server-side cardNumber generator. */
export function generateCardNumber(): string {
  const a = Math.floor(1000 + Math.random() * 9000);
  const b = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${b}`;
}

/** 32 bytes base64url, per-card HMAC secret */
export function generateCardSecret(): string {
  return randomBytes(32).toString("base64url");
}
