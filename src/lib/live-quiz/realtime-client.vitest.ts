import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("live quiz Realtime client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-key");
    createClientMock.mockReset();
    createClientMock.mockReturnValue({ channel: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the legacy anon key when a publishable key is not configured", async () => {
    const { getLiveQuizRealtimeClient } = await import("./realtime-client");

    expect(getLiveQuizRealtimeClient()).not.toBeNull();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "legacy-anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      }),
    );
  });

  it("returns null without public Supabase configuration and caches one client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const missingModule = await import("./realtime-client");
    expect(missingModule.getLiveQuizRealtimeClient()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-key");
    const configuredModule = await import("./realtime-client");
    const first = configuredModule.getLiveQuizRealtimeClient();
    expect(configuredModule.getLiveQuizRealtimeClient()).toBe(first);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});
