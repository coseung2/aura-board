import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), broadcast: vi.fn(), invalidate: vi.fn(), blobs: vi.fn() }));
const board = { id: "board-1", layout: "columns", classroomId: "class-1", thumbnailUrl: "https://example.test/image.png", eventPosterUrl: null, cards: [] };
vi.mock("@/lib/db", () => ({ db: { board: { findFirst: vi.fn(async () => board), delete: mocks.remove }, $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ board: { update: mocks.update } })) } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "teacher-1", email: "teacher@example.test" })) }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn(async () => "owner"), ForbiddenError: class extends Error {} }));
vi.mock("@/lib/default-groups", () => ({ snapshotClassroomGroupsToBoard: vi.fn() }));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: vi.fn() }));
vi.mock("@/lib/blob-cleanup", () => ({ enqueueBlobDeletion: mocks.blobs }));
vi.mock("@/lib/board-access-cache", () => ({ invalidateBoardAccessCache: vi.fn() }));
vi.mock("@/lib/board-snapshot-cache", () => ({ invalidateBoardSnapshotCache: mocks.invalidate }));
vi.mock("@/lib/board-viewer-like-cache", () => ({ invalidateBoardViewerLikeCache: vi.fn() }));
vi.mock("@/lib/card-broadcast-queue", () => ({ scheduleCardChangeBroadcast: mocks.broadcast }));
import { PATCH, DELETE } from "./route";
const context = { params: Promise.resolve({ id: "board-1" }) };

describe("public board settings/delete synchronization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue(board); mocks.blobs.mockResolvedValue(undefined); });
  it("publishes settings changes without resetting an omitted thumbnail", async () => {
    const response = await PATCH(new Request("http://localhost/api/boards/board-1", { method: "PATCH", body: JSON.stringify({ title: "New title" }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "board-1" }, data: { title: "New title" } });
    expect(mocks.broadcast).toHaveBeenCalledWith("board-1", "update");
    expect(mocks.blobs).not.toHaveBeenCalled();
  });
  it("invalidates deleted snapshots and still announces deletion when blob reservation fails", async () => {
    mocks.blobs.mockRejectedValueOnce(new Error("cleanup unavailable"));
    const response = await DELETE(new Request("http://localhost/api/boards/board-1", { method: "DELETE" }), context);
    expect(response.status).toBe(204);
    expect(mocks.invalidate).toHaveBeenCalledWith("board-1");
    expect(mocks.broadcast).toHaveBeenCalledWith("board-1", "delete");
  });
});
