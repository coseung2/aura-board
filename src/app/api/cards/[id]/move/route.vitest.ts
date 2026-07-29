import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identityKind: "teacher" as "teacher" | "anon",
  sections: new Map<string, string>(),
  update: vi.fn(),
  touch: vi.fn(),
}));

const card = {
  id: "card-1",
  boardId: "board-1",
  authorId: null,
  studentAuthorId: null,
  externalAuthorKey: "guest-owner",
};

vi.mock("@/lib/db", () => {
  const tx = {
    section: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; boardId: string } }) =>
        mocks.sections.get(where.id) === where.boardId ? { id: where.id } : null,
      ),
    },
    card: { update: mocks.update },
  };
  return {
    db: {
      card: { findUnique: vi.fn(async () => card) },
      board: {
        findUnique: vi.fn(async () => ({
          id: "board-1",
          classroomId: "classroom-1",
          classroom: { teacherId: "teacher-1" },
        })),
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
      ),
    },
  };
});

vi.mock("@/lib/identity", () => ({
  resolveIdentities: vi.fn(async () =>
    mocks.identityKind === "teacher"
      ? {
          teacher: {
            userId: "teacher-1",
            name: "Teacher",
            ownsBoardIds: new Set(["board-1"]),
          },
          student: null,
          parent: null,
          share: null,
          primary: "teacher",
        }
      : {
          teacher: null,
          student: null,
          parent: null,
          share: null,
          primary: "anon",
        },
  ),
}));

vi.mock("@/lib/share/with-share", () => ({
  requireShareAuth: vi.fn(async (shareToken: string) => ({
    identity: {
      shareToken,
      boardId: "board-1",
      permission: "student",
      authorName: "Guest",
    },
  })),
}));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: mocks.touch }));

import { PATCH } from "./route";

function request(sectionId: string | null, guestId?: string) {
  return new Request("http://localhost/api/cards/card-1/move", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(guestId
        ? { "x-share-token": "share-token", "x-share-guest-id": guestId }
        : {}),
    },
    body: JSON.stringify({ sectionId, order: 3 }),
  });
}

const context = { params: Promise.resolve({ id: "card-1" }) };

describe("card move route section integrity", () => {
  beforeEach(() => {
    mocks.identityKind = "teacher";
    mocks.sections.clear();
    mocks.update.mockReset();
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...card,
      ...data,
    }));
    mocks.touch.mockReset();
  });

  it("moves a card to a section on the same board", async () => {
    mocks.sections.set("section-1", "board-1");

    const response = await PATCH(request("section-1"), context);

    expect(response.status).toBe(200);
    expect((await response.json()).card).toMatchObject({ sectionId: "section-1", order: 3 });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { sectionId: "section-1", order: 3 },
    });
  });

  it("rejects a cross-board section without mutating the card", async () => {
    mocks.sections.set("section-other", "board-2");

    const response = await PATCH(request("section-other"), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "sectionId does not belong to boardId" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a missing section without mutating the card", async () => {
    const response = await PATCH(request("section-missing"), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves moves by the matching share-card author", async () => {
    mocks.identityKind = "anon";
    mocks.sections.set("section-1", "board-1");

    const response = await PATCH(request("section-1", "guest-owner"), context);

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
