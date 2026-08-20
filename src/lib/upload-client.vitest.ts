import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SIZE } from "@/app/api/upload/upload-policy";
import { UploadClientError, uploadFile } from "./upload-client";
import {
  MEDIA_DEGRADED_MESSAGE,
  MEDIA_DEGRADED_MODE_CODE,
} from "./media-degraded";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadFile preflight", () => {
  it("rejects SVG before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = {
      name: "vector.svg",
      type: "image/svg+xml",
      size: 100,
    } as File;

    await expect(uploadFile(file)).rejects.toThrow("SVG");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects files over 4 MiB before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = {
      name: "large.mp4",
      type: "video/mp4",
      size: MAX_SIZE + 1,
    } as File;

    await expect(uploadFile(file)).rejects.toThrow("4 MiB");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the server code and message for a degraded-mode 503", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: MEDIA_DEGRADED_MESSAGE,
          code: MEDIA_DEGRADED_MODE_CODE,
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const file = new File(["hello"], "note.txt", { type: "text/plain" });

    const error = await uploadFile(file).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(UploadClientError);
    expect(error).toMatchObject({
      status: 503,
      code: MEDIA_DEGRADED_MODE_CODE,
      message: MEDIA_DEGRADED_MESSAGE,
    });
  });
});
