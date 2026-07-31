/**
 * Cloudflare Stream verification in POST /api/event/submit.
 *
 * Only the cfstream branch is covered here; the YouTube/token/captcha paths are
 * exercised elsewhere. All collaborators (db, captcha, throttle, cookies) are
 * mocked so the test stays a unit test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  verifyCaptcha: vi.fn(),
  checkThrottle: vi.fn(),
  cookieSet: vi.fn(),
  getVideoDetails: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    board: { findUnique: mocks.findUnique },
    submission: { create: mocks.create },
  },
}));
vi.mock("@/lib/event/hcaptcha", () => ({ verifyCaptcha: mocks.verifyCaptcha }));
vi.mock("@/lib/event/throttle", () => ({ checkThrottle: mocks.checkThrottle }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));

// Real helpers except the network call.
vi.mock("@/lib/event/cfstream", async () => {
  const actual = await vi.importActual<typeof import("@/lib/event/cfstream")>(
    "@/lib/event/cfstream"
  );
  return { ...actual, getVideoDetails: mocks.getVideoDetails };
});

import { POST } from "./route";

const UID = "abc123def456abc123def456abc12345";
const BOARD_ID = "board1";
const TOKEN = "board-access-token";

function board(over: Record<string, unknown> = {}) {
  return {
    id: BOARD_ID,
    layout: "event-signup",
    accessMode: "public-link",
    accessToken: TOKEN,
    applicationStart: null,
    applicationEnd: null,
    askName: false,
    askGradeClass: false,
    askStudentNumber: false,
    askContact: false,
    customQuestions: null,
    videoPolicy: "optional",
    videoProviders: "cfstream",
    maxVideoDurationSec: 300,
    maxVideoSizeMb: 200,
    requireApproval: false,
    ...over,
  };
}

function submitRequest(body: Record<string, unknown>) {
  return new Request("https://example.test/api/event/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ boardId: BOARD_ID, token: TOKEN, ...body }),
  });
}

function video(over: Record<string, unknown> = {}) {
  return {
    uid: UID,
    readyToStream: false,
    state: "ready",
    creator: `board:${BOARD_ID}`,
    meta: { boardId: BOARD_ID },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(board());
  mocks.verifyCaptcha.mockResolvedValue({ ok: true });
  mocks.checkThrottle.mockResolvedValue({ ok: true, count: 1 });
  mocks.create.mockImplementation(async () => ({
    id: "sub1",
    submitToken: "st",
    status: "submitted",
  }));
  process.env.CF_ACCOUNT_ID = "acct";
  process.env.CF_STREAM_API_TOKEN = "tok";
});

afterEach(() => {
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_STREAM_API_TOKEN;
});

describe("cfstream submission validation", () => {
  it("accepts a ready upload owned by the board", async () => {
    mocks.getVideoDetails.mockResolvedValue(video({ readyToStream: true }));
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      videoProvider: "cfstream",
      videoId: UID,
    });
  });

  // Encoding can lag behind the browser upload; blocking here would fail
  // legitimate last-minute submissions.
  it("accepts a still-encoding upload", async () => {
    mocks.getVideoDetails.mockResolvedValue(video({ state: "inprogress" }));
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(200);
  });

  it("rejects an upload that never completed", async () => {
    mocks.getVideoDetails.mockResolvedValue(video({ state: "pendingupload" }));
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "video_not_ready",
      reason: "upload_incomplete",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an errored upload", async () => {
    mocks.getVideoDetails.mockResolvedValue(video({ state: "error" }));
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("encoding_failed");
  });

  it("rejects a uid minted for another board in the same account", async () => {
    mocks.getVideoDetails.mockResolvedValue(
      video({ readyToStream: true, creator: "board:other", meta: { boardId: "other" } })
    );
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "video_not_owned" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects conflicting board metadata even when creator matches", async () => {
    mocks.getVideoDetails.mockResolvedValue(
      video({ readyToStream: true, creator: `board:${BOARD_ID}`, meta: { boardId: "other" } })
    );
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "video_not_owned" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("still accepts legacy untagged uploads", async () => {
    mocks.getVideoDetails.mockResolvedValue(
      video({ readyToStream: true, creator: null, meta: {} })
    );
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(200);
  });

  it("rejects a nonexistent uid", async () => {
    mocks.getVideoDetails.mockResolvedValue(null);
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "video_not_found" });
  });

  it("rejects a malformed uid without hitting Cloudflare", async () => {
    const res = await POST(
      submitRequest({ videoProvider: "cfstream", videoId: "../../accounts" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_video_id" });
    expect(mocks.getVideoDetails).not.toHaveBeenCalled();
  });

  it("returns 502 instead of trusting the uid when Cloudflare errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getVideoDetails.mockRejectedValue(new Error("boom"));
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "cfstream_unavailable" });
    expect(mocks.create).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("preserves the pre-existing trust-the-uid fallback when CF is unconfigured", async () => {
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_STREAM_API_TOKEN;
    const res = await POST(submitRequest({ videoProvider: "cfstream", videoId: UID }));
    expect(res.status).toBe(200);
    expect(mocks.getVideoDetails).not.toHaveBeenCalled();
  });

  it("requires a videoId for the cfstream provider", async () => {
    const res = await POST(submitRequest({ videoProvider: "cfstream" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_required", field: "videoId" });
  });
});
