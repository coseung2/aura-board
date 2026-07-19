import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SIZE } from "@/app/api/upload/upload-policy";
import { uploadFile } from "./upload-client";

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
});
