import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  CODE_LENGTH,
  CROCKFORD_ALPHABET,
  formatCodeForDisplay,
  normalizeCode,
} from "./class-invite-codes-shared";

// parent-class-invite-v2 — server-side code helpers.
// Generation + hash + verify require Node crypto and must never ship to a
// Client Component bundle. The client-safe counterpart (normalize + display
// format) lives in class-invite-codes-shared.ts.

export { CODE_LENGTH, CROCKFORD_ALPHABET, formatCodeForDisplay, normalizeCode };

function randomCrockfordChar(): string {
  const buf = randomBytes(1);
  return CROCKFORD_ALPHABET[buf[0] % 32];
}

export function generateCode(): { code: string; codeHash: string } {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += randomCrockfordChar();
  }
  return { code, codeHash: hashCode(code) };
}

// invite-code-5-digit (2026-04-26): 5자리는 32^5 = 3.3M 조합. 동시 active
// 100개 가정 충돌 ~0.015%. probe-then-create 패턴으로 ~5e-7 까지 감소.
// 호출 측은 결과 (code, codeHash) 로 곧바로 create 만 하면 됨.
export async function generateUniqueCode(
  isHashTaken: (hash: string) => Promise<boolean>,
  maxAttempts = 5
): Promise<{ code: string; codeHash: string }> {
  for (let i = 0; i < maxAttempts; i += 1) {
    const pair = generateCode();
    if (!(await isHashTaken(pair.codeHash))) return pair;
  }
  throw new Error("could_not_generate_unique_code");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyCode(input: string, storedHash: string): boolean {
  const candidateHash = hashCode(normalizeCode(input));
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
