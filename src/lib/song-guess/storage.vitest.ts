import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { downloadPrivateObject, uploadPrivateObject } from "@/lib/media-storage";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("private song-guess storage boundary", () => {
  it("uses the provisioned private bucket when no override is configured", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "public-bucket");
    vi.stubEnv("SONG_GUESS_STORAGE_BUCKET", "");
    vi.stubEnv("AURA_SONG_GUESS_BUCKET", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response("clip"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadPrivateObject("song-guess/board-1/clip.wav");

    expect(result.body.toString()).toBe("clip");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example.test/storage/v1/object/aura-board-song-guess/song-guess/board-1/clip.wav",
      expect.objectContaining({ cache: "no-store", headers: {
        authorization: "Bearer server-only-key", apikey: "server-only-key",
      } }),
    );
  });

  it("rejects traversal and non-song object identities", async () => {
    await expect(
      uploadPrivateObject("song-guess/../public/clip.webm", Buffer.from("x"), {
        contentType: "audio/webm",
      }),
    ).rejects.toThrow("invalid storage pathname");
    await expect(
      uploadPrivateObject("uploads/clip.webm", Buffer.from("x"), {
        contentType: "audio/webm",
      }),
    ).rejects.toThrow("invalid private storage pathname");
  });

  it("refuses to use the public bucket for private clips", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-key");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "public-bucket");
    vi.stubEnv("SONG_GUESS_STORAGE_BUCKET", "public-bucket");
    await expect(
      uploadPrivateObject("song-guess/board-1/clip.webm", Buffer.from("x"), {
        contentType: "audio/webm",
      }),
    ).rejects.toThrow("dedicated bucket");
  });
});
