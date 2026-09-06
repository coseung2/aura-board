import { afterEach, describe, expect, it, vi } from "vitest";
import {
  availableLayoutKeys, canCreateLayout, canReadLayout, canUseProductFeature,
  layoutRelease, layoutReleaseBadge, productCapabilities,
} from "./product-release";
import { isAdminEmail } from "./admin";
import { isFeatureEnabled } from "./feature-flags";

const scope = vi.hoisted(() => ({ parent: vi.fn(), student: vi.fn(), link: vi.fn() }));
vi.mock("@/lib/parent-scope", () => ({
  withParentScope: scope.parent,
  withParentScopeForStudent: scope.student,
  requireParentChildLinkOwned: scope.link,
  ParentScopeError: class extends Error {},
}));
import { GET as testChildren } from "@/app/api/parent/test/children/route";
import { GET as testIsolation } from "@/app/api/parent/test/cross-isolation/route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("product release policy", () => {
  it("offers exactly the established four stable creation layouts", () => {
    expect(availableLayoutKeys().filter((key) => canCreateLayout(key))).toEqual([
      "freeform", "columns", "dj-queue", "plant-roadmap",
    ]);
  });
  it("preserves legacy reading without offering normal creation", () => {
    for (const key of ["grid", "event-signup"]) {
      expect(canReadLayout(key)).toBe(true);
      expect(canCreateLayout(key)).toBe(false);
    }
  });
  it.each(["stream", "assignment", "quiz", "assessment", "vibe-arcade", "omok"])("gates %s consistently", (key) => {
    expect(canReadLayout(key)).toBe(false);
    expect(canCreateLayout(key)).toBe(false);
    expect(canReadLayout(key, { isAdminClassroom: true })).toBe(true);
    expect(canCreateLayout(key, { isAdminClassroom: true })).toBe(false);
    expect(canCreateLayout(key, { isAdmin: true })).toBe(true);
    expect(layoutReleaseBadge(key)).toBe("개발중");
  });
  it.each(["unknown", "__proto__", "constructor"])("rejects unknown layout %s even for admins", (key) => {
    expect(layoutRelease(key)).toBeNull();
    expect(canReadLayout(key, { isAdmin: true })).toBe(false);
    expect(canCreateLayout(key, { isAdmin: true })).toBe(false);
  });
  it("defaults every experimental capability off", () => {
    expect(Object.values(productCapabilities()).every((value) => value === false)).toBe(true);
    expect(Object.values(productCapabilities({ isAdmin: true })).every(Boolean)).toBe(true);
    expect(canUseProductFeature("community", { isAdminClassroom: true })).toBe(false);
    expect(canUseProductFeature("play", { isAdminClassroom: true })).toBe(true);
  });
  it("keeps unavailable picker choices separate from admin API test access", () => {
    expect(layoutRelease("quiz")?.picker).toBe("disabled");
    expect(layoutRelease("stream")?.picker).toBe("enabled");
  });
});

describe("administrator and UI switches", () => {
  it("accepts every configured admin, including normalized email casing", () => {
    vi.stubEnv("AURA_ADMIN_EMAILS", "first@example.com, SECOND@example.com");
    expect(isAdminEmail(" second@EXAMPLE.com ")).toBe(true);
    expect(isAdminEmail("normal@example.com")).toBe(false);
    vi.stubEnv("AURA_ADMIN_EMAILS", "");
    expect(isAdminEmail("first@example.com")).toBe(false);
  });
  it("uses an explicit production UI switch without granting release access", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FF_breakoutSettings", "");
    expect(isFeatureEnabled("breakoutSettings")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_FF_breakoutSettings", "true");
    expect(isFeatureEnabled("breakoutSettings")).toBe(true);
    expect(canReadLayout("breakout")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_FF_breakoutSettings", "false");
    expect(isFeatureEnabled("breakoutSettings")).toBe(false);
  });
});

describe("QA routes in production", () => {
  it("returns 404 before scope/database work", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("http://localhost/api/parent/test/children?linkId=anything");
    expect((await testChildren(request)).status).toBe(404);
    expect((await testIsolation(request)).status).toBe(404);
    expect(scope.parent).not.toHaveBeenCalled();
    expect(scope.student).not.toHaveBeenCalled();
    expect(scope.link).not.toHaveBeenCalled();
  });
});
