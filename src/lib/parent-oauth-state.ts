// parent-redesign (2026-04-26): OAuth state cookie HMAC sign/verify — 순수
// crypto. server-only 의존 없이 단위 테스트 가능. parent-oauth.ts 가 이
// 모듈을 import 해 쿠키 set/get 에 사용.

import { createHmac, timingSafeEqual } from "crypto";

export type StatePayload = {
  state: string;
  codeVerifier?: string;
  exp: number;
  redirect?: string;
  /** Native clients return through the fixed auraboard:// callback. */
  client?: "mobile";
};

export function signStatePayload(payload: StatePayload, secret: string): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyStateToken(
  token: string,
  secret: string,
  nowMs: number = Date.now()
): StatePayload | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(b64, "base64url").toString()
    ) as StatePayload;
    if (payload.exp < nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}
