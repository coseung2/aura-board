/**
 * POST /api/event/video-upload-url — direct upload issuance contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createDirectUploadUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { board: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/event/cfstream", async () => {
  const actual = await vi.importActual<typeof import("@/lib/event/cfstream")>(
    "@/lib/event/cfstream"
  );
  return { ...actual, createDirectUploadUrl: mocks.createDirectUploadUrl };
});

import { POST } from "./route";

const UID = "abc123def456abc123def456abc12345";
const TOKEN = "board-access-token";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://example.test/api/event/video-upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ boardId: "board1", token: TOKEN, ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CF_ACCOUNT_ID = "acct";
  process.env.CF_STREAM_API_TOKEN = "tok";
  mocks.findUnique.mockResolvedValue({
    id: "board1",
    accessMode: "public-link",
    accessToken: TOKEN,
    videoProviders: "youtube,cfstream",
    maxVideoDurationSec: 300,
    maxVideoSizeMb: 200,
  });
  mocks.createDirectUploadUrl.mockResolvedValue({
    uploadURL: "https://upload.test/x",
    uid: UID,
  });
});

afterEach(() => {
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_STREAM_API_TOKEN;
});

describe("POST /api/event/video-upload-url", () => {
  it("passes the board duration cap plus ownership creator/meta", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, uploadURL: "https://upload.test/x", uid: UID });
    expect(mocks.createDirectUploadUrl).toHaveBeenCalledWith({
      maxDurationSeconds: 300,
      maxSizeMb: 200,
      creator: "board:board1",
      meta: { boardId: "board1", app: "aura-board-event" },
    });
  });

  it("answers 501 when Cloudflare is unconfigured", async () => {
    delete process.env.CF_STREAM_API_TOKEN;
    const res = await POST(request());
    expect(res.status).toBe(501);
    expect(mocks.createDirectUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a wrong access token", async () => {
    const res = await POST(request({ token: "wrong-token" }));
    expect(res.status).toBe(401);
    expect(mocks.createDirectUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects boards that don't enable cfstream", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "board1",
      accessMode: "public-link",
      accessToken: TOKEN,
      videoProviders: "youtube",
    });
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "cfstream_disabled_for_board" });
  });

  it("maps a Cloudflare API failure to 502 without leaking details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { CfStreamError } = await import("@/lib/event/cfstream");
    mocks.createDirectUploadUrl.mockRejectedValue(
      new CfStreamError("http_error", { status: 403, apiErrorCodes: [10000] })
    );
    const res = await POST(request());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "cfstream_create_failed" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("tok");
    spy.mockRestore();
  });
});
