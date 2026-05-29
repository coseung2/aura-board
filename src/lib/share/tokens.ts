/**
 * Board-share token utilities.
 *
 * Reuses the same pattern as src/lib/event/tokens.ts but keeps concerns
 * separate since share vs event-signup tokens serve different semantics.
 */
import { randomBytes, timingSafeEqual } from "crypto";

export function issueShareToken(): string {
  // 16 raw bytes → 22 base64url chars; slice to 21 for consistency with nanoid(21).
  return randomBytes(16).toString("base64url").slice(0, 21);
}

export function issueShortCode(): string {
  // 4 raw bytes → 6 base64url chars (no padding). /s/CODE.
  // 64^6 ≈ 68B combinations — collision-resistant at board scale.
  return randomBytes(4).toString("base64url").replace(/=+$/, "");
}

export function tokensEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
