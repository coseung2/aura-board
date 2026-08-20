import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import {
  deletePrivateObject,
  deletePublicObjects,
  downloadPrivateObject,
  MediaStorageError,
  uploadPrivateObject,
  uploadPublicObject,
} from "./media-storage";
import {
  MEDIA_DEGRADED_MESSAGE,
  MEDIA_DEGRADED_MODE_CODE,
} from "./media-degraded";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("media storage degraded mode guards", () => {
  it("blocks public upload and delete before external storage I/O", async () => {
    vi.stubEnv("AURA_DR_MEDIA_DEGRADED_MODE", "1");
    vi.stubGlobal("fetch", mocks.fetch);

    await expect(
      uploadPublicObject("uploads/file.png", Buffer.from("image"), {
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({
      name: "MediaStorageError",
      code: MEDIA_DEGRADED_MODE_CODE,
      message: MEDIA_DEGRADED_MESSAGE,
    } satisfies Partial<MediaStorageError>);
    await expect(
      deletePublicObjects(["https://storage.example.test/object.png"]),
    ).rejects.toMatchObject({ code: MEDIA_DEGRADED_MODE_CODE });

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("blocks private upload, download, and delete before external storage I/O", async () => {
    vi.stubEnv("AURA_DR_MEDIA_DEGRADED_MODE", "true");
    vi.stubGlobal("fetch", mocks.fetch);

    await expect(
      uploadPrivateObject("song-guess/clip.wav", Buffer.from("audio"), {
        contentType: "audio/wav",
      }),
    ).rejects.toMatchObject({ code: MEDIA_DEGRADED_MODE_CODE });
    await expect(downloadPrivateObject("song-guess/clip.wav")).rejects.toMatchObject({
      code: MEDIA_DEGRADED_MODE_CODE,
    });
    await expect(deletePrivateObject("song-guess/clip.wav")).rejects.toMatchObject({
      code: MEDIA_DEGRADED_MODE_CODE,
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
