import { describe, expect, it } from "vitest";
import {
  createPasswordHash,
  isValidAccountPassword,
  isValidPasswordUsername,
  localPrincipalEmail,
  normalizePasswordUsername,
  verifyPasswordHash,
} from "./password-credential-core";

describe("password credentials", () => {
  it("normalizes and validates public usernames", () => {
    expect(normalizePasswordUsername("  Test.User  ")).toBe("test.user");
    expect(isValidPasswordUsername("test_user-01")).toBe(true);
    expect(isValidPasswordUsername("abc")).toBe(false);
    expect(isValidPasswordUsername("한글아이디")).toBe(false);
  });

  it("enforces the password length contract", () => {
    expect(isValidAccountPassword("1234567")).toBe(false);
    expect(isValidAccountPassword("12345678")).toBe(true);
    expect(isValidAccountPassword("x".repeat(72))).toBe(true);
    expect(isValidAccountPassword("x".repeat(73))).toBe(false);
  });

  it("hashes and verifies without storing plaintext", async () => {
    const hash = await createPasswordHash("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPasswordHash("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPasswordHash("wrong password", hash)).resolves.toBe(false);
    await expect(verifyPasswordHash("wrong password", "malformed")).resolves.toBe(false);
  });

  it("derives a stable non-routable principal for public signup", () => {
    const first = localPrincipalEmail("Example_User");
    const second = localPrincipalEmail("example_user");
    expect(first).toBe(second);
    expect(first.endsWith("@accounts.aura-board.invalid")).toBe(true);
    expect(first).not.toContain("example_user");
  });
});
