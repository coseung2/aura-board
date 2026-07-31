/**
 * DELETE /api/event/submission — Cloudflare Stream cleanup contract.
 *
 * The invariant under test: the DB row is always removed, and a Cloudflare
 * failure only downgrades the reported `videoCleanup` field.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  del: vi.fn(),
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  deleteVideo: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { submission: { findUnique: mocks.findUnique, delete: mocks.del, update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac", () => ({
  requirePermission: mocks.requirePermission,
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("@/lib/event/cfstream", () => ({ deleteVideo: mocks.deleteVideo }));

import { DELETE } from "./route";

const UID = "abc123def456abc123def456abc12345";

function deleteRequest(submissionId = "sub1") {
  return new Request("https://example.test/api/event/submission", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user1" });
  mocks.requirePermission.mockResolvedValue("owner");
  mocks.del.mockResolvedValue({ id: "sub1" });
  mocks.findUnique.mockResolvedValue({
    id: "sub1",
    boardId: "board1",
    videoProvider: "cfstream",
    videoId: UID,
  });
});

describe("DELETE submission cfstream cleanup", () => {
  it("deletes the Stream asset after the DB row", async () => {
    mocks.deleteVideo.mockResolvedValue({ ok: true, alreadyGone: false });
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, videoCleanup: "deleted" });
    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.deleteVideo).toHaveBeenCalledWith(UID);
  });

  it("reports already_gone for an idempotent re-delete", async () => {
    mocks.deleteVideo.mockResolvedValue({ ok: true, alreadyGone: true });
    const res = await DELETE(deleteRequest());
    expect(await res.json()).toEqual({ ok: true, videoCleanup: "already_gone" });
  });

  it("keeps the DB deletion when Cloudflare fails and warns about the orphan", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteVideo.mockResolvedValue({ ok: false, reason: "api_failed" });
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, videoCleanup: "failed" });
    expect(mocks.del).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("orphan");
    expect(logged).not.toContain(UID);
    spy.mockRestore();
  });

  it("reports skipped when Cloudflare is not configured", async () => {
    mocks.deleteVideo.mockResolvedValue({ ok: false, reason: "not_configured" });
    const res = await DELETE(deleteRequest());
    expect(await res.json()).toEqual({ ok: true, videoCleanup: "skipped" });
  });

  it("does not call Cloudflare for youtube submissions", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "sub1",
      boardId: "board1",
      videoProvider: "youtube",
      videoId: "abcDEF123_4",
    });
    const res = await DELETE(deleteRequest());
    expect(await res.json()).toEqual({ ok: true, videoCleanup: "skipped" });
    expect(mocks.deleteVideo).not.toHaveBeenCalled();
  });

  it("does not delete anything when the caller lacks permission", async () => {
    const ForbiddenError = (await import("@/lib/rbac")).ForbiddenError;
    mocks.requirePermission.mockRejectedValue(new ForbiddenError("nope"));
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(403);
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.deleteVideo).not.toHaveBeenCalled();
  });
});
