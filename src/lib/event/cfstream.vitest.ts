import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CfStreamError,
  checkSubmittable,
  createDirectUploadUrl,
  deleteVideo,
  getVideoDetails,
  isValidStreamUid,
  normalizeMaxDurationSeconds,
  streamCreatorForBoard,
  type CfStreamVideo,
} from "./cfstream";

const ACCOUNT = "acct123";
const TOKEN = "cf-secret-token-value";
const UID = "abc123def456abc123def456abc12345"; // 32 chars

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function videoBody(over: Record<string, unknown> = {}) {
  return {
    success: true,
    errors: [],
    result: { uid: UID, readyToStream: false, status: { state: "queued" }, ...over },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.CF_ACCOUNT_ID = ACCOUNT;
  process.env.CF_STREAM_API_TOKEN = TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_STREAM_API_TOKEN;
});

describe("uid validation", () => {
  it("accepts Cloudflare-shaped uids up to 32 chars", () => {
    expect(isValidStreamUid(UID)).toBe(true);
    expect(isValidStreamUid("a")).toBe(true);
  });

  it("rejects empty, oversized and path-traversal-ish values", () => {
    expect(isValidStreamUid("")).toBe(false);
    expect(isValidStreamUid("a".repeat(33))).toBe(false);
    expect(isValidStreamUid("../../accounts")).toBe(false);
    expect(isValidStreamUid("abc/def")).toBe(false);
    expect(isValidStreamUid("abc def")).toBe(false);
    expect(isValidStreamUid("abc?x=1")).toBe(false);
    expect(isValidStreamUid(null)).toBe(false);
    expect(isValidStreamUid(123)).toBe(false);
  });

  it("never issues an API call for an invalid uid", async () => {
    await expect(getVideoDetails("../secrets")).rejects.toMatchObject({ code: "invalid_uid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normalizeMaxDurationSeconds", () => {
  it("defaults, clamps low and clamps to the documented 36000 ceiling", () => {
    expect(normalizeMaxDurationSeconds(null)).toBe(600);
    expect(normalizeMaxDurationSeconds(undefined)).toBe(600);
    expect(normalizeMaxDurationSeconds(0)).toBe(1);
    expect(normalizeMaxDurationSeconds(-5)).toBe(1);
    expect(normalizeMaxDurationSeconds(99_999)).toBe(36_000);
    expect(normalizeMaxDurationSeconds(120.9)).toBe(120);
  });
});

describe("createDirectUploadUrl", () => {
  it("always sends maxDurationSeconds, plus creator/meta", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, result: { uploadURL: "https://upload.test/x", uid: UID } })
    );

    const result = await createDirectUploadUrl({
      maxDurationSeconds: null,
      maxSizeMb: 200,
      creator: streamCreatorForBoard("board1"),
      meta: { boardId: "board1" },
    });

    expect(result).toEqual({ uploadURL: "https://upload.test/x", uid: UID });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/direct_upload`
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.maxDurationSeconds).toBe(600);
    expect(body.creator).toBe("board:board1");
    expect(body.meta).toEqual({ boardId: "board1" });
    // maxSizeMb is client-side only; it must not be forwarded.
    expect(body).not.toHaveProperty("maxSizeMb");
  });

  it("clamps a board's oversized duration cap", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, result: { uploadURL: "https://upload.test/x", uid: UID } })
    );
    await createDirectUploadUrl({ maxDurationSeconds: 100_000 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.maxDurationSeconds).toBe(36_000);
  });

  it("returns null when Cloudflare is not configured and makes no request", async () => {
    delete process.env.CF_STREAM_API_TOKEN;
    await expect(createDirectUploadUrl({ maxDurationSeconds: 60 })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws bad_response when the payload is missing uid/uploadURL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, result: { uid: UID } }));
    await expect(createDirectUploadUrl({ maxDurationSeconds: 60 })).rejects.toMatchObject({
      code: "bad_response",
    });
  });
});

describe("getVideoDetails", () => {
  it("maps a ready video", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        videoBody({
          readyToStream: true,
          status: { state: "ready" },
          creator: "board:b1",
          meta: { boardId: "b1" },
        })
      )
    );
    const video = await getVideoDetails(UID);
    expect(video).toEqual({
      uid: UID,
      readyToStream: true,
      state: "ready",
      creator: "board:b1",
      meta: { boardId: "b1" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/${UID}`
    );
  });

  it("maps an in-progress video that is not yet ready to stream", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(videoBody({ readyToStream: false, status: { state: "inprogress" } }))
    );
    const video = await getVideoDetails(UID);
    expect(video?.state).toBe("inprogress");
    expect(video?.readyToStream).toBe(false);
  });

  it("maps an errored video", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(videoBody({ status: { state: "error" } }))
    );
    expect((await getVideoDetails(UID))?.state).toBe("error");
  });

  it("returns null for a 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(getVideoDetails(UID)).resolves.toBeNull();
  });

  it("throws api_error with CF codes when success is false", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, errors: [{ code: 10004, message: "nope" }], result: null })
    );
    const err = await getVideoDetails(UID).catch((e) => e);
    expect(err).toBeInstanceOf(CfStreamError);
    expect(err.code).toBe("api_error");
    expect(err.apiErrorCodes).toEqual([10004]);
  });

  it("throws bad_response when the result schema is wrong", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, result: { uid: 42 } }));
    await expect(getVideoDetails(UID)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("throws bad_response when Cloudflare returns a different uid", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(videoBody({ uid: "differentUid" }))
    );
    await expect(getVideoDetails(UID)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("throws network_error without leaking the request details", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error(`connect ECONNREFUSED for ${TOKEN} at accounts/${ACCOUNT}`)
    );
    const err = await getVideoDetails(UID).catch((e) => e);
    expect(err.code).toBe("network_error");
    expect(err.message).not.toContain(TOKEN);
  });

  it("redacts token and response body from http errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { success: false, errors: [{ code: 10000, message: `bad token ${TOKEN}` }] },
        403
      )
    );
    const err = await getVideoDetails(UID).catch((e) => e);
    expect(err.code).toBe("http_error");
    expect(err.status).toBe(403);
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain("bad token");
    expect(err.message).toContain("status=403");
  });

  it("sends the bearer token in the Authorization header only", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(videoBody()));
    await getVideoDetails(UID);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
  });
});

describe("checkSubmittable", () => {
  function video(over: Partial<CfStreamVideo>): CfStreamVideo {
    return { uid: UID, readyToStream: false, state: null, creator: null, meta: {}, ...over };
  }

  it("accepts ready uploads as non-pending", () => {
    expect(checkSubmittable(video({ readyToStream: true, state: "ready" }))).toEqual({
      ok: true,
      pending: false,
    });
  });

  // Product decision: encoding often finishes after the browser upload does, so
  // we accept mid-encode states rather than reject an honest late submission.
  it("accepts still-encoding states as pending", () => {
    for (const state of ["downloading", "queued", "inprogress"] as const) {
      expect(checkSubmittable(video({ state }))).toEqual({ ok: true, pending: true });
    }
  });

  it("rejects pendingupload, error, live and unknown states", () => {
    expect(checkSubmittable(video({ state: "pendingupload" }))).toEqual({
      ok: false,
      reason: "upload_incomplete",
    });
    expect(checkSubmittable(video({ state: "error" }))).toEqual({
      ok: false,
      reason: "encoding_failed",
    });
    expect(checkSubmittable(video({ readyToStream: true, state: "error" }))).toEqual({
      ok: false,
      reason: "encoding_failed",
    });
    expect(checkSubmittable(video({ state: "live-inprogress" }))).toEqual({
      ok: false,
      reason: "unknown_state",
    });
    expect(checkSubmittable(video({ state: null }))).toEqual({
      ok: false,
      reason: "unknown_state",
    });
  });
});

describe("deleteVideo", () => {
  it("deletes with the Stream write endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, result: null }));
    await expect(deleteVideo(UID)).resolves.toEqual({ ok: true, alreadyGone: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream/${UID}`
    );
    expect(init.method).toBe("DELETE");
  });

  it("treats 404 as idempotent success", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(deleteVideo(UID)).resolves.toEqual({ ok: true, alreadyGone: true });
  });

  it("never throws on API failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, errors: [] }, 500));
    await expect(deleteVideo(UID)).resolves.toEqual({ ok: false, reason: "api_failed" });
  });

  it("reports invalid uid and not-configured without calling the API", async () => {
    await expect(deleteVideo("../x")).resolves.toEqual({ ok: false, reason: "invalid_uid" });
    delete process.env.CF_ACCOUNT_ID;
    await expect(deleteVideo(UID)).resolves.toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
