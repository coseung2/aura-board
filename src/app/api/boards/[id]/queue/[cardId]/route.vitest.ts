import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudent: vi.fn(),
  getEffectiveBoardRole: vi.fn(),
  boardFindFirst: vi.fn(),
  cardFindUnique: vi.fn(),
  cardUpdate: vi.fn(),
  cardUpdateMany: vi.fn(),
  cardFindUniqueOrThrow: vi.fn(),
  djPlayEventCreate: vi.fn(),
  studentFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  touchBoardUpdatedAt: vi.fn(),
  resolveCardAuthorLabels: vi.fn(),
  announceQueueChange: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/rbac", () => ({
  getEffectiveBoardRole: mocks.getEffectiveBoardRole,
}));
vi.mock("@/lib/board-touch", () => ({
  touchBoardUpdatedAt: mocks.touchBoardUpdatedAt,
}));
vi.mock("@/lib/card-author-labels", () => ({
  resolveCardAuthorLabels: mocks.resolveCardAuthorLabels,
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  announceQueueChange: mocks.announceQueueChange,
}));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findFirst: mocks.boardFindFirst },
    card: {
      findUnique: mocks.cardFindUnique,
      update: mocks.cardUpdate,
    },
    student: { findUnique: mocks.studentFindUnique },
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { PATCH } from "./route";

const initialCard = {
  id: "card-1",
  boardId: "board-1",
  title: "Race-safe song",
  queueStatus: "approved",
  authorId: null,
  studentAuthorId: "student-1",
  externalAuthorName: "Student One",
  videoUrl: null,
  linkUrl: "https://youtu.be/abcdefghijk",
  linkImage: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
};

let storedCard = { ...initialCard };
let playEvents: Array<Record<string, unknown>> = [];

function request(status: "approved" | "rejected" | "played") {
  return new Request("https://example.test/api/boards/board-1/queue/card-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

function context() {
  return { params: Promise.resolve({ id: "board-1", cardId: "card-1" }) };
}

describe("PATCH DJ queue status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedCard = { ...initialCard };
    playEvents = [];

    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getCurrentStudent.mockResolvedValue(null);
    mocks.getEffectiveBoardRole.mockResolvedValue("owner");
    mocks.boardFindFirst.mockResolvedValue({
      id: "board-1",
      layout: "dj-queue",
      classroomId: "classroom-1",
      anonymousAuthor: false,
    });
    // Return a snapshot so concurrent requests can both observe `approved`.
    mocks.cardFindUnique.mockImplementation(async () => ({ ...storedCard }));
    mocks.cardUpdate.mockImplementation(
      async ({ data }: { data: { queueStatus: string } }) => {
        storedCard = { ...storedCard, ...data, updatedAt: new Date() };
        return { ...storedCard };
      },
    );
    mocks.cardUpdateMany.mockImplementation(
      async ({ where, data }: {
        where: { id: string; boardId: string; queueStatus: string };
        data: { queueStatus: string };
      }) => {
        if (
          storedCard.id !== where.id ||
          storedCard.boardId !== where.boardId ||
          storedCard.queueStatus !== where.queueStatus
        ) {
          return { count: 0 };
        }
        storedCard = { ...storedCard, ...data, updatedAt: new Date() };
        return { count: 1 };
      },
    );
    mocks.cardFindUniqueOrThrow.mockImplementation(async () => ({ ...storedCard }));
    mocks.djPlayEventCreate.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        playEvents.push(data);
        return { id: `event-${playEvents.length}`, ...data };
      },
    );
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
      const cardSnapshot = { ...storedCard };
      const eventSnapshot = [...playEvents];
      try {
        return await operation({
          card: {
            updateMany: mocks.cardUpdateMany,
            findUniqueOrThrow: mocks.cardFindUniqueOrThrow,
          },
          djPlayEvent: { create: mocks.djPlayEventCreate },
          student: { findUnique: mocks.studentFindUnique },
          user: { findUnique: mocks.userFindUnique },
        });
      } catch (error) {
        storedCard = cardSnapshot;
        playEvents = eventSnapshot;
        throw error;
      }
    });
    mocks.resolveCardAuthorLabels.mockResolvedValue({ authorName: "Student One" });
  });

  it("allows exactly one concurrent played transition and one ranking event", async () => {
    const [first, second] = await Promise.all([
      PATCH(request("played"), context()),
      PATCH(request("played"), context()),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    await expect(loser.json()).resolves.toEqual({
      error: "큐 항목 상태가 이미 변경되었습니다",
    });
    expect(storedCard.queueStatus).toBe("played");
    expect(playEvents).toHaveLength(1);
    expect(mocks.djPlayEventCreate).toHaveBeenCalledOnce();
    expect(mocks.touchBoardUpdatedAt).toHaveBeenCalledOnce();
    expect(mocks.announceQueueChange).toHaveBeenCalledOnce();
  });

  it("rolls the played transition back when the ranking event insert fails", async () => {
    mocks.djPlayEventCreate.mockRejectedValueOnce(new Error("event insert failed"));

    await expect(PATCH(request("played"), context())).rejects.toThrow(
      "event insert failed",
    );

    expect(storedCard.queueStatus).toBe("approved");
    expect(playEvents).toEqual([]);
    expect(mocks.touchBoardUpdatedAt).not.toHaveBeenCalled();
    expect(mocks.announceQueueChange).not.toHaveBeenCalled();
  });

  it("preserves non-played transitions without creating a play event", async () => {
    const response = await PATCH(request("rejected"), context());

    expect(response.status).toBe(200);
    expect(storedCard.queueStatus).toBe("rejected");
    expect(mocks.cardUpdate).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { queueStatus: "rejected" },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.djPlayEventCreate).not.toHaveBeenCalled();
  });
});
