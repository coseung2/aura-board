import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyLike: vi.fn(),
  touchBoard: vi.fn(),
  announce: vi.fn(),
  cardFindUnique: vi.fn(),
  likeCount: vi.fn(),
  commentCount: vi.fn(),
  postCommit: [] as Promise<void>[],
}));

vi.mock("@/lib/card-engagement-actor", () => ({
  getCurrentCardActor: vi.fn(async () => ({
    kind: "student",
    id: "student-1",
    name: "학생",
    classroomId: "classroom-1",
  })),
  authorizeCardAccess: vi.fn(async () => ({
    ok: true,
    ctx: {
      cardId: "card-1",
      boardId: "board-1",
      classroomId: "classroom-1",
      anonymousAuthor: false,
      studentAuthorId: "student-1",
      studentAuthorIds: ["student-1"],
      guardianAvailable: true,
    },
  })),
}));
vi.mock("@/lib/card-like-toggle", () => ({
  applyCardLikeMutation: mocks.applyLike,
  getPrismaErrorCode: vi.fn(() => undefined),
}));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: mocks.touchBoard }));
vi.mock("@/lib/realtime-broadcast", () => ({
  announceEngagementChange: mocks.announce,
}));
vi.mock("@/lib/post-commit", () => ({
  schedulePostCommit: (_label: string, task: () => Promise<void>) => {
    mocks.postCommit.push(task());
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    card: { findUnique: mocks.cardFindUnique },
    cardLike: { count: mocks.likeCount },
    cardComment: { count: mocks.commentCount },
  },
}));

import { POST } from "./route";

describe("card like route query shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postCommit.length = 0;
    mocks.applyLike.mockResolvedValue(true);
    mocks.likeCount.mockResolvedValue(7);
    mocks.commentCount.mockResolvedValue(4);
  });

  it("reuses the authorized board id instead of querying the card again", async () => {
    const response = await POST(
      new Request("http://localhost/api/cards/card-1/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ liked: true }),
      }),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ liked: true, count: 7 });
    await Promise.all(mocks.postCommit);
    expect(mocks.cardFindUnique).not.toHaveBeenCalled();
    expect(mocks.touchBoard).toHaveBeenCalledWith("board-1", {
      action: "like.created",
      actorType: "student",
      actorId: "student-1",
      coalesceMs: 1_000,
    });
    expect(mocks.announce).toHaveBeenCalledWith(
      "board-1",
      "card-1",
      7,
      4,
      "like",
    );
  });
});
