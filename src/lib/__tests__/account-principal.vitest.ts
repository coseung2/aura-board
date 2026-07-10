import { describe, expect, it } from "vitest";
import {
  isSameAccountPrincipal,
  normalizeAccountPrincipal,
} from "../account-principal";

describe("account principal", () => {
  it("normalizes email casing and surrounding whitespace", () => {
    expect(normalizeAccountPrincipal("  Teacher@Example.COM ")).toBe(
      "teacher@example.com"
    );
  });

  it("allows a teacher and parent session only for the same email", () => {
    expect(isSameAccountPrincipal("teacher@example.com", "TEACHER@example.com")).toBe(
      true
    );
    expect(isSameAccountPrincipal("teacher@example.com", "parent@example.com")).toBe(
      false
    );
  });

  it("does not treat missing email as the same account", () => {
    expect(isSameAccountPrincipal(null, null)).toBe(false);
    expect(isSameAccountPrincipal("teacher@example.com", null)).toBe(false);
  });
});
