import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  clearParentSession: vi.fn(),
  withParentAuth: vi.fn(),
  cardCommentUpdateMany: vi.fn(),
  cardCommentLikeDeleteMany: vi.fn(),
  cardLikeDeleteMany: vi.fn(),
  inviteUpdateMany: vi.fn(),
  passwordDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  parentDelete: vi.fn(),
}));

vi.mock("@/lib/parent-auth-only", () => ({
  withParentAuth: mocks.withParentAuth,
}));
vi.mock("@/lib/parent-session", () => ({
  clearParentSession: mocks.clearParentSession,
}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction },
}));

import { POST } from "./route";

const tx = {
  cardComment: { updateMany: mocks.cardCommentUpdateMany },
  cardCommentLike: { deleteMany: mocks.cardCommentLikeDeleteMany },
  cardLike: { deleteMany: mocks.cardLikeDeleteMany },
  parentInviteCode: { updateMany: mocks.inviteUpdateMany },
  passwordCredential: { deleteMany: mocks.passwordDeleteMany },
  user: { findUnique: mocks.userFindUnique },
  parent: { delete: mocks.parentDelete },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withParentAuth.mockImplementation(
    async (_req: Request, handler: (ctx: { parent: { id: string } }) => unknown) =>
      handler({ parent: { id: "parent-1", email: "parent@example.com" } }),
  );
  mocks.transaction.mockImplementation(
    async (handler: (client: typeof tx) => unknown) => handler(tx),
  );
  mocks.userFindUnique.mockResolvedValue(null);
});

describe("POST /api/parent/account/withdraw", () => {
  it("permanently removes parent identities without requiring a child link", async () => {
    const response = await POST(
      new Request("https://aura-board.com/api/parent/account/withdraw", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.withParentAuth).toHaveBeenCalledOnce();
    expect(mocks.inviteUpdateMany).toHaveBeenCalledWith({
      where: { boundToEmail: "parent@example.com" },
      data: { boundToEmail: null },
    });
    expect(mocks.passwordDeleteMany).toHaveBeenCalledWith({
      where: { principalEmail: "parent@example.com" },
    });
    expect(mocks.parentDelete).toHaveBeenCalledWith({ where: { id: "parent-1" } });
    expect(mocks.clearParentSession).toHaveBeenCalledOnce();
  });

  it("detaches retained comments and removes parent likes", async () => {
    await POST(
      new Request("https://aura-board.com/api/parent/account/withdraw", {
        method: "POST",
      }),
    );

    expect(mocks.cardCommentUpdateMany).toHaveBeenCalledWith({
      where: { authorParentId: "parent-1" },
      data: { authorParentId: null },
    });
    expect(mocks.cardCommentLikeDeleteMany).toHaveBeenCalledWith({
      where: { likerParentId: "parent-1" },
    });
    expect(mocks.cardLikeDeleteMany).toHaveBeenCalledWith({
      where: { likerParentId: "parent-1" },
    });
  });

  it("preserves a password credential shared with a teacher role", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "teacher-1" });

    await POST(
      new Request("https://aura-board.com/api/parent/account/withdraw", {
        method: "POST",
      }),
    );

    expect(mocks.passwordDeleteMany).not.toHaveBeenCalled();
    expect(mocks.parentDelete).toHaveBeenCalledOnce();
  });
});
