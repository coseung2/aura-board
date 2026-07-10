import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import {
  clearPublicSupabaseClientCacheForTests,
  createIsolatedPublicSupabaseClient,
  createPublicSupabaseClient,
} from "@/lib/supabase/client";

describe("public Supabase client ownership", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    createClientMock.mockReset();
    createClientMock.mockImplementation(() => ({}));
    clearPublicSupabaseClientCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps default clients cached but gives isolated consumers distinct clients", () => {
    const cached = createPublicSupabaseClient();
    const isolatedA = createIsolatedPublicSupabaseClient();
    const isolatedB = createIsolatedPublicSupabaseClient();

    expect(createPublicSupabaseClient()).toBe(cached);
    expect(isolatedA).not.toBe(cached);
    expect(isolatedB).not.toBe(cached);
    expect(isolatedB).not.toBe(isolatedA);
    expect(createClientMock).toHaveBeenCalledTimes(3);
  });
});
