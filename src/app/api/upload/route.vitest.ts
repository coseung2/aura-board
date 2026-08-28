import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SIZE } from "./upload-policy";
import {
  MEDIA_DEGRADED_MESSAGE,
  MEDIA_DEGRADED_MODE_CODE,
} from "@/lib/media-degraded";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudentUploadIdentityRaw: vi.fn(),
  uploadPublicObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({
  getCurrentStudentUploadIdentityRaw: mocks.getCurrentStudentUploadIdentityRaw,
}));
vi.mock("@/lib/media-storage", () => ({ uploadPublicObject: mocks.uploadPublicObject }));
vi.mock("@/lib/blob", () => ({
  resizeBufferToWebPPreview: vi.fn(),
  uploadWebPBuffer: vi.fn(),
  extractVideoThumbnail: vi.fn(),
}));
vi.mock("@/lib/error-log", () => ({ logError: vi.fn() }));

import { POST } from "./route";

describe("POST /api/upload limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1", email: "teacher@example.test" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the recovery-mode 503 before parsing or streaming the body", async () => {
    vi.stubEnv("AURA_DR_MEDIA_DEGRADED_MODE", "1");
    const formData = vi.fn(async () => {
      throw new Error("multipart body must not be parsed");
    });
    const getReader = vi.fn();
    const request = {
      headers: new Headers({
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(MAX_SIZE + 64 * 1024 + 1),
      }),
      body: { getReader },
      formData,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: MEDIA_DEGRADED_MESSAGE,
      code: MEDIA_DEGRADED_MODE_CODE,
    });
    expect(formData).not.toHaveBeenCalled();
    expect(getReader).not.toHaveBeenCalled();
    expect(mocks.uploadPublicObject).not.toHaveBeenCalled();
  });

  it("keeps authentication ahead of the degraded-mode availability response", async () => {
    vi.stubEnv("AURA_DR_MEDIA_DEGRADED_MODE", "1");
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getCurrentStudentUploadIdentityRaw.mockResolvedValue(null);
    const formData = vi.fn();
    const response = await POST({ headers: new Headers(), formData } as unknown as Request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects an oversized Content-Length before parsing multipart data", async () => {
    const formData = vi.fn();
    const request = {
      headers: new Headers({
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(MAX_SIZE + 64 * 1024 + 1),
      }),
      formData,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "file_too_large" });
    expect(formData).not.toHaveBeenCalled();
  });

  it("allows multipart envelope bytes around a file at the size boundary", async () => {
    const formData = vi.fn(async () => ({ get: () => null }));
    const request = {
      headers: new Headers({
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(MAX_SIZE + 1024),
      }),
      formData,
    } as unknown as Request;

    const response = await POST(request);

    expect(formData).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "No file provided" });
  });

  it("rechecks parsed file size and returns 413", async () => {
    const request = {
      headers: new Headers({ "content-type": "multipart/form-data; boundary=test" }),
      formData: vi.fn(async () => ({
        get: () => ({
          name: "large.png",
          size: MAX_SIZE + 1,
          type: "image/png",
          arrayBuffer: vi.fn(),
        }),
      })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "file_too_large" });
    expect(mocks.uploadPublicObject).not.toHaveBeenCalled();
  });

  it("rejects SVG after multipart parsing", async () => {
    const request = {
      headers: new Headers({ "content-type": "multipart/form-data; boundary=test" }),
      formData: vi.fn(async () => ({
        get: () => ({
          name: "vector.svg",
          size: 100,
          type: "image/svg+xml",
          arrayBuffer: vi.fn(),
        }),
      })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "svg_not_allowed" });
    expect(mocks.uploadPublicObject).not.toHaveBeenCalled();
  });

  it("returns 400 when a malformed native multipart part is not file-like", async () => {
    const request = {
      headers: new Headers({ "content-type": "multipart/form-data; boundary=test" }),
      formData: vi.fn(async () => ({
        get: () => ({ name: "photo.jpg", size: 100, type: "image/jpeg" }),
      })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No file provided" });
    expect(mocks.uploadPublicObject).not.toHaveBeenCalled();
  });
});
