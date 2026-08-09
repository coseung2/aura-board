import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));

import { GET } from "./route";

describe("GET /api/student/realtime-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://runtime.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the runtime public URL and publishable key without exposing service credentials", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("Vary")).toBe("Cookie, Authorization");
    expect(await response.json()).toEqual({
      configured: true,
      url: "https://runtime.example.supabase.co",
      key: "publishable-key",
    });
  });

  it("returns unauthorized with private no-store headers when no student is signed in", async () => {
    mocks.getCurrentStudent.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("Vary")).toBe("Cookie, Authorization");
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("prefers SUPABASE_URL when both runtime URL settings are present", async () => {
    vi.stubEnv("SUPABASE_URL", "https://private-runtime.example.supabase.co");

    const response = await GET();

    expect(await response.json()).toEqual({
      configured: true,
      url: "https://private-runtime.example.supabase.co",
      key: "publishable-key",
    });
  });

  it("falls back to the runtime anon key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const response = await GET();

    expect(await response.json()).toEqual({
      configured: true,
      url: "https://runtime.example.supabase.co",
      key: "anon-key",
    });
  });

  it("returns an unconfigured response when the runtime public settings are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: false });
  });
});
