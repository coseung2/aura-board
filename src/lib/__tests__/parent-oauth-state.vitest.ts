import { describe, it, expect } from "vitest";
import {
  signStatePayload,
  verifyStateToken,
} from "../parent-oauth-state";

const SECRET = "test-secret-32-bytes-long-aaaaaa";

describe("parent-oauth-state — HMAC sign/verify", () => {
  it("정상 sign + verify round-trip", () => {
    const payload = {
      state: "abc123",
      codeVerifier: "v1",
      exp: Date.now() + 60_000,
    };
    const token = signStatePayload(payload, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const got = verifyStateToken(token, SECRET);
    expect(got).toEqual(payload);
  });

  it("만료된 token 은 null", () => {
    const payload = {
      state: "x",
      exp: Date.now() - 1, // 이미 만료
    };
    const token = signStatePayload(payload, SECRET);
    expect(verifyStateToken(token, SECRET)).toBe(null);
  });

  it("nowMs 인자로 시간 mocking 가능", () => {
    const payload = { state: "x", exp: 1000 };
    const token = signStatePayload(payload, SECRET);
    // exp=1000, now=999 → 통과
    expect(verifyStateToken(token, SECRET, 999)).toEqual(payload);
    // exp=1000, now=1001 → 만료
    expect(verifyStateToken(token, SECRET, 1001)).toBe(null);
  });

  it("HMAC 위조 (signature 변경) → null", () => {
    const payload = { state: "x", exp: Date.now() + 60_000 };
    const token = signStatePayload(payload, SECRET);
    const tampered = token.slice(0, -1) + "X";
    expect(verifyStateToken(tampered, SECRET)).toBe(null);
  });

  it("payload b64 부분만 변조 (signature 그대로) → null", () => {
    const payload = { state: "x", exp: Date.now() + 60_000 };
    const token = signStatePayload(payload, SECRET);
    const [b64, sig] = token.split(".");
    // 다른 payload b64 + 원래 sig 조합
    const evil = { state: "evil", exp: Date.now() + 60_000 };
    const evilB64 = Buffer.from(JSON.stringify(evil)).toString("base64url");
    expect(verifyStateToken(`${evilB64}.${sig}`, SECRET)).toBe(null);
    expect(b64).not.toBe(evilB64);
  });

  it("다른 secret 으로 verify → null", () => {
    const payload = { state: "x", exp: Date.now() + 60_000 };
    const token = signStatePayload(payload, SECRET);
    expect(verifyStateToken(token, "other-secret")).toBe(null);
  });

  it("형식 깨진 token → null", () => {
    expect(verifyStateToken("not-a-token", SECRET)).toBe(null);
    expect(verifyStateToken(".", SECRET)).toBe(null);
    expect(verifyStateToken("abc.", SECRET)).toBe(null);
    expect(verifyStateToken("", SECRET)).toBe(null);
  });

  it("optional 필드 (codeVerifier, redirect, client) 보존", () => {
    const payload = {
      state: "abc",
      codeVerifier: "verifier-string",
      redirect: "/parent/home",
      client: "mobile" as const,
      exp: Date.now() + 60_000,
    };
    const token = signStatePayload(payload, SECRET);
    expect(verifyStateToken(token, SECRET)).toEqual(payload);
  });
});
