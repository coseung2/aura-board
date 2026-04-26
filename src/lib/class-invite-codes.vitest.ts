import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  CROCKFORD_ALPHABET,
  formatCodeForDisplay,
  normalizeCode,
} from "./class-invite-codes-shared";
import { generateCode, hashCode, verifyCode } from "./class-invite-codes";

describe("class-invite-codes", () => {
  it("generateCode produces a CODE_LENGTH Crockford Base32 string", () => {
    const { code } = generateCode();
    expect(code).toHaveLength(CODE_LENGTH);
    for (const ch of code) {
      expect(CROCKFORD_ALPHABET).toContain(ch);
    }
  });

  it("normalizeCode strips hyphens/whitespace and uppercases", () => {
    expect(normalizeCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeCode("  ab cd  ef gh  ")).toBe("ABCDEFGH");
  });

  it("normalizeCode applies Crockford aliases (I→1, L→1, O→0)", () => {
    expect(normalizeCode("IOL2")).toBe("1012");
  });

  it("formatCodeForDisplay: 5자리는 raw, 8자리는 4-4 split (legacy), 그 외는 raw", () => {
    expect(formatCodeForDisplay("ABCD1")).toBe("ABCD1");
    expect(formatCodeForDisplay("ABCD1234")).toBe("ABCD-1234");
    expect(formatCodeForDisplay("ABC")).toBe("ABC");
  });

  it("verifyCode accepts the same code and rejects a different one", () => {
    const { code, codeHash } = generateCode();
    expect(verifyCode(code, codeHash)).toBe(true);
    expect(verifyCode(formatCodeForDisplay(code), codeHash)).toBe(true);
    const { code: other, codeHash: otherHash } = generateCode();
    if (code === other) return;
    expect(verifyCode(other, codeHash)).toBe(false);
    expect(verifyCode(code, otherHash)).toBe(false);
  });

  it("hashCode is deterministic", () => {
    expect(hashCode("ABCDEFGH")).toBe(hashCode("ABCDEFGH"));
  });
});
