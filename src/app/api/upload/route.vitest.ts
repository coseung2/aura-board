import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SIZE } from "./upload-policy";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudent: vi.fn(),
  uploadPublicObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
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
        get: () => ({ name: "large.png", size: MAX_SIZE + 1, type: "image/png" }),
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
        get: () => ({ name: "vector.svg", size: 100, type: "image/svg+xml" }),
      })),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "svg_not_allowed" });
    expect(mocks.uploadPublicObject).not.toHaveBeenCalled();
  });
});
