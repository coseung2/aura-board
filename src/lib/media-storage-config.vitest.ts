import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPublicStorageBucket,
  getSupabaseStorageConfig,
} from "./media-storage";

describe("media storage bucket configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the default bucket when configured values are blank", () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "");
    vi.stubEnv("AURA_STORAGE_BUCKET", "   ");

    expect(getPublicStorageBucket()).toBe("aura-board-uploads");
    expect(getSupabaseStorageConfig()?.bucket).toBe("aura-board-uploads");
  });

  it("uses the first non-blank configured bucket", () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", " ");
    vi.stubEnv("AURA_STORAGE_BUCKET", " custom-bucket ");

    expect(getPublicStorageBucket()).toBe("custom-bucket");
    expect(getSupabaseStorageConfig()?.bucket).toBe("custom-bucket");
  });
});
