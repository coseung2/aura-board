import { afterEach, describe, expect, it, vi } from "vitest";
import { canUseClassroomDefaultGroupFallback } from "./default-groups";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classroom default group fallback policy", () => {
  it("keeps classroom seating fallback administrator-only", () => {
    expect(canUseClassroomDefaultGroupFallback("teacher@example.com")).toBe(false);
    expect(canUseClassroomDefaultGroupFallback("mallagaenge@gmail.com")).toBe(true);
  });

  it("respects configured additional administrators", () => {
    vi.stubEnv("AURA_ADMIN_EMAILS", "admin2@example.com");
    expect(canUseClassroomDefaultGroupFallback("admin2@example.com")).toBe(true);
    expect(canUseClassroomDefaultGroupFallback("mallagaenge@gmail.com")).toBe(false);
  });
});
