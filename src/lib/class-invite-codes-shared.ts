// parent-class-invite-v2 — client-safe helpers.
// No Node-only APIs. Imported by both the server module
// (src/lib/class-invite-codes.ts) and Client Components like CodeInput8.

export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// invite-code-5-digit (2026-04-26): 8 → 5. 32^5 = 3.3M 조합, classroom
// rate limit 100/24h 와 결합하면 평균 ~460년 brute-force 시도 필요 → 안전.
export const CODE_LENGTH = 5;

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0");
}

export function formatCodeForDisplay(code: string): string {
  // 5자리는 한 덩어리, 원래 8자리 시절은 4-4 split. 그 외 길이는 raw.
  if (code.length === 5) return code;
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
}
