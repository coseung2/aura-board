import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  boardFindUnique: vi.fn(),
  studentFindMany: vi.fn(),
  transaction: vi.fn(),
  sectionAggregate: vi.fn(),
  sectionCreate: vi.fn(),
  boardUpdate: vi.fn(),
  requirePermission: vi.fn(),
  touchBoardUpdatedAt: vi.fn(),
  announceCardChange: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    board: {
      findUnique: mocks.boardFindUnique,
    },
    student: {
      findMany: mocks.studentFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/rbac", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requirePermission: mocks.requirePermission,
}));

vi.mock("@/lib/board-touch", () => ({
  touchBoardUpdatedAt: mocks.touchBoardUpdatedAt,
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  announceCardChange: mocks.announceCardChange,
}));

import { POST } from "./route";

const endpoint =
  "https://aura-board.example/api/boards/board-1/sections/seed-students";

function request(body?: string) {
  return new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}

const routeContext = { params: Promise.resolve({ id: "board-1" }) };

describe("POST /api/boards/:id/sections/seed-students", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.boardFindUnique.mockResolvedValue({
      classroomId: "classroom-1",
      layout: "columns",
      subjectOrder: "asc",
    });
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.studentFindMany.mockResolvedValue([
      { id: "student-1", name: "Alice", number: 1 },
      { id: "student-2", name: "Bob", number: 2 },
    ]);
    mocks.sectionAggregate.mockResolvedValue({ _min: { order: null } });
    mocks.sectionCreate.mockImplementation(async ({ data }) => ({
      id: `section-${data.title}`,
      pinned: false,
      ...data,
    }));
    mocks.boardUpdate.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        section: {
          aggregate: mocks.sectionAggregate,
          create: mocks.sectionCreate,
        },
        board: { update: mocks.boardUpdate },
      }),
    );
    mocks.touchBoardUpdatedAt.mockResolvedValue(undefined);
    mocks.announceCardChange.mockResolvedValue(undefined);
  });

  it("keeps the optional payload behavior for an empty request body", async () => {
    const response = await POST(request(), routeContext);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subjectOrder: "asc" });
    expect(mocks.sectionCreate).toHaveBeenCalledTimes(2);
    expect(mocks.boardUpdate).not.toHaveBeenCalled();
    expect(mocks.touchBoardUpdatedAt).toHaveBeenCalledWith("board-1");
    expect(mocks.announceCardChange).toHaveBeenCalledWith("board-1", "update");
  });

  it("returns 400 for malformed JSON instead of treating it as an empty body", async () => {
    const response = await POST(request('{"subjectOrder":'), routeContext);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that fails Zod validation", async () => {
    const response = await POST(
      request(JSON.stringify({ subjectOrder: "sideways" })),
      routeContext,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.any(String),
    });
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
