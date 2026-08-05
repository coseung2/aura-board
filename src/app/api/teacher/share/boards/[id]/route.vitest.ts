import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  boardFindFirst: vi.fn(),
  boardUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    board: {
      findFirst: mocks.boardFindFirst,
      update: mocks.boardUpdate,
    },
  },
}));

import { PATCH } from "./route";

function request(published: boolean) {
  return new Request("http://localhost/api/teacher/share/boards/board-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ published }),
  });
}

describe("PATCH /api/teacher/share/boards/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.boardFindFirst.mockResolvedValue({ id: "board-1", layout: "columns" });
    mocks.boardUpdate.mockResolvedValue({
      id: "board-1",
      communityPublishedAt: new Date("2026-08-05T00:00:00.000Z"),
    });
  });

  it("publishes only an owner board without changing student share fields", async () => {
    const response = await PATCH(request(true), {
      params: Promise.resolve({ id: "board-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.boardFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "board-1",
          members: { some: { userId: "teacher-1", role: "owner" } },
        }),
      }),
    );
    const update = mocks.boardUpdate.mock.calls[0]?.[0];
    expect(update.data.communityPublishedAt).toBeInstanceOf(Date);
    expect(update.data).not.toHaveProperty("shareMode");
    expect(update.data).not.toHaveProperty("shareToken");
    expect(update.data).not.toHaveProperty("shareShortCode");
  });

  it("does not update a board the teacher does not own", async () => {
    mocks.boardFindFirst.mockResolvedValue(null);

    const response = await PATCH(request(true), {
      params: Promise.resolve({ id: "other-board" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.boardUpdate).not.toHaveBeenCalled();
  });
});
