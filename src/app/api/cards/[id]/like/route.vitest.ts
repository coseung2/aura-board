import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyLike: vi.fn(),
  scheduleBoardActivity: vi.fn(),
  scheduleEngagementBroadcast: vi.fn(),
  cardFindUnique: vi.fn(),
  likeCount: vi.fn(),
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
vi.mock("@/lib/board-activity-queue", () => ({
  scheduleBoardActivity: mocks.scheduleBoardActivity,
}));
vi.mock("@/lib/engagement-broadcast-queue", () => ({
  scheduleEngagementBroadcast: mocks.scheduleEngagementBroadcast,
}));
vi.mock("@/lib/db", () => ({
  db: {
    card: { findUnique: mocks.cardFindUnique },
    cardLike: { count: mocks.likeCount },
  },
}));

import { POST } from "./route";

describe("card like route query shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyLike.mockResolvedValue(true);
    mocks.likeCount.mockResolvedValue(7);
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
    expect(mocks.cardFindUnique).not.toHaveBeenCalled();
    expect(mocks.scheduleBoardActivity).toHaveBeenCalledWith("board-1", {
      action: "like.created",
      actorType: "student",
      actorId: "student-1",
      coalesceMs: 1_000,
    });
    expect(mocks.scheduleEngagementBroadcast).toHaveBeenCalledWith(
      "board-1",
      "card-1",
      "like",
    );
  });
});
