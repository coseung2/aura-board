import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchBoard = vi.hoisted(() => vi.fn());
vi.mock("./share-board", () => ({ fetchShareBoard: fetchBoard, ShareBoardUnavailableError: class extends Error {} }));
import { handleShareApiFetch } from "./share-api";
const session = { shareToken: "token", shareMode: "student" as const, guestId: "guest", authorName: "name" };

describe("share HTTP parity", () => {
  beforeEach(() => fetchBoard.mockReset());
  it.each([
    ["/api/cards", "POST"], ["/api/cards/card-1", "PATCH"], ["/api/cards/card-1", "DELETE"],
    ["/api/share/cards/card-1/like", "POST"], ["/api/share/cards/card-1/comments", "POST"],
    ["/api/share/cards/card-1/engagement", "GET"],
  ])("does not intercept %s %s away from the authorized server API", async (path, method) => {
    expect(await handleShareApiFetch(session, path, { method })).toBeNull();
    expect(fetchBoard).not.toHaveBeenCalled();
  });
  it("rejects a snapshot lookup for a different board", async () => {
    fetchBoard.mockResolvedValue({ board: { id: "board-1", slug: "slug-1" }, initialCards: [], initialSections: [] });
    const response = await handleShareApiFetch(session, "/api/boards/other-board/snapshot");
    expect(response?.status).toBe(403);
  });
});
