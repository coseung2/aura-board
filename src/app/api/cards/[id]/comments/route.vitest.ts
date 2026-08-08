import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  comments: [] as Array<Record<string, unknown>>,
  transactions: [] as Array<Record<string, unknown>>,
  balance: 0,
  actor: {
    kind: "student",
    id: "student-1",
    name: "학생",
    classroomId: "classroom-1",
  } as
    | { kind: "student"; id: string; name: string; classroomId: string }
    | { kind: "teacher"; id: string; name: string }
    | { kind: "parent"; id: string; name: string },
  existingContents: [] as string[],
  replay: null as Record<string, unknown> | null,
  replyTarget: null as Record<string, unknown> | null,
  award: vi.fn(),
  loadPreparedRewardContext: vi.fn(),
  create: vi.fn(),
  announce: vi.fn(),
  schedulePostCommit: vi.fn(),
  guardianAvailable: true,
}));

vi.mock("@/lib/card-engagement-actor", () => ({
  getCurrentCardActor: vi.fn(async () => mocks.actor),
  authorizeCardAccess: vi.fn(async () => ({
    ok: true,
    ctx: {
      boardId: "board-1",
      classroomId: "classroom-1",
      anonymousAuthor: false,
      guardianAvailable: mocks.guardianAvailable,
    },
  })),
}));

vi.mock("@/lib/bank", () => ({
  ensureAccountFor: vi.fn(async () => ({ accountId: "account-1", cardId: "card-1" })),
}));

vi.mock("@/lib/reward-service", () => ({
  loadRewardPolicyCached: vi.fn(async () => ({
    commentMinMeaningfulLength: 4,
    commentRewardAmount: 5,
  })),
  awardCappedPolicyReward: mocks.award,
  loadPreparedCommentRewardContext: mocks.loadPreparedRewardContext,
}));

vi.mock("@/lib/creatures/activity-rewards", () => ({
  retryActivityRewardTransaction: (operation: () => Promise<unknown>) => operation(),
}));

vi.mock("@/lib/card-engagement-format", () => ({
  formatEngagementAuthor: ({ name }: { name: string }) => name,
}));
vi.mock("@/lib/realtime-broadcast", () => ({ announceEngagementChange: mocks.announce }));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: vi.fn() }));
vi.mock("@/lib/post-commit", () => ({
  schedulePostCommit: mocks.schedulePostCommit,
}));

vi.mock("@/lib/db", () => {
  const tx = {
    cardComment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) return mocks.replyTarget?.id === where.id ? mocks.replyTarget : null;
        return mocks.replay?.cardId === where.cardId &&
          (where.deletedAt === undefined || (mocks.replay.deletedAt ?? null) === where.deletedAt)
          ? mocks.replay
          : null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const key = where.authorStudentId_cardId_clientRequestId as
          | { cardId?: string }
          | undefined;
        return mocks.replay?.cardId === key?.cardId ? mocks.replay : null;
      }),
      create: mocks.create,
    },
    $queryRaw: vi.fn(async (query: { values?: readonly unknown[] }) => {
      const normalized = String(query.values?.at(-1) ?? "");
      const exists = mocks.existingContents.some(
        (content) =>
          content.normalize("NFKC").trim().replace(/\s+/g, " ") === normalized,
      );
      return [{ exists }];
    }),
    transaction: { findFirst: vi.fn(), count: vi.fn() },
  };
  return {
    db: {
      ...tx,
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
        const snapshot = [...mocks.comments];
        const transactionSnapshot = [...mocks.transactions];
        const balanceSnapshot = mocks.balance;
        try {
          return await operation(tx);
        } catch (error) {
          mocks.comments.splice(0, mocks.comments.length, ...snapshot);
          mocks.transactions.splice(0, mocks.transactions.length, ...transactionSnapshot);
          mocks.balance = balanceSnapshot;
          throw error;
        }
      }),
      cardLike: { count: vi.fn(async () => 0) },
      card: { findUnique: vi.fn(async () => ({ boardId: "board-1" })) },
    },
  };
});

import { POST } from "./route";

function request(
  clientRequestId = "request-0001",
  content = "정말 좋은 글이에요",
  audience?: "public" | "guardian",
  parentCommentId?: string,
) {
  return new Request("http://localhost/api/cards/card-1/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, clientRequestId, audience, parentCommentId }),
  });
}

describe("student comment reward transaction", () => {
  beforeEach(() => {
    mocks.comments.length = 0;
    mocks.transactions.length = 0;
    mocks.balance = 0;
    mocks.actor = {
      kind: "student",
      id: "student-1",
      name: "학생",
      classroomId: "classroom-1",
    };
    mocks.existingContents.length = 0;
    mocks.replay = null;
    mocks.replyTarget = null;
    mocks.award.mockReset();
    mocks.loadPreparedRewardContext.mockReset();
    mocks.loadPreparedRewardContext.mockImplementation(
      async (
        _tx: unknown,
        input: { normalizedContent: string },
      ) => ({
        duplicate: mocks.existingContents.some(
          (content) =>
            content.normalize("NFKC").trim().replace(/\s+/g, " ") ===
            input.normalizedContent,
        ),
        counts: { daily: 0, weekly: 0 },
        rewardContext: { buffBps: 0, hasActiveCreature: false },
      }),
    );
    mocks.create.mockReset();
    mocks.announce.mockReset();
    mocks.schedulePostCommit.mockReset();
    mocks.guardianAvailable = true;
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if (
        mocks.replay &&
        mocks.replay.cardId === data.cardId &&
        (mocks.replay.clientRequestId ?? data.clientRequestId) ===
          data.clientRequestId &&
        (mocks.replay.deletedAt ?? null) === null
      ) {
        throw new Prisma.PrismaClientKnownRequestError("duplicate comment", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const row = {
        id: "comment-1",
        ...data,
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        authorUser: null,
        authorStudent: { id: "student-1", name: "학생" },
        authorParent:
          data.authorParentId === "parent-1" ? { id: "parent-1", name: "보호자" } : null,
      };
      mocks.comments.push(row);
      return row;
    });
  });

  it("prepares one locked reward context before creating the comment", async () => {
    mocks.award.mockResolvedValueOnce({ amount: 5, baseAmount: 5, buffBps: 0 });
    const database = (await import("@/lib/db")).db;
    database.$transaction.mockClear();

    const response = await POST(request(), {
      params: Promise.resolve({ id: "card-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.loadPreparedRewardContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: "account-1",
        studentId: "student-1",
        classroomId: "classroom-1",
        normalizedContent: "정말 좋은 글이에요",
      }),
    );
    expect(
      mocks.loadPreparedRewardContext.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "ReadCommitted" },
    );
  });

  it("rolls comment creation back when its atomic reward mutation fails", async () => {
    mocks.award.mockImplementationOnce(async () => {
      mocks.balance += 5;
      mocks.transactions.push({ sourceType: "comment_reward", amount: 5 });
      throw new Error("wallet write failed");
    });

    await expect(POST(request(), { params: Promise.resolve({ id: "card-1" }) })).rejects.toThrow(
      "wallet write failed",
    );
    expect(mocks.comments).toHaveLength(0);
    expect(mocks.balance).toBe(0);
    expect(mocks.transactions).toHaveLength(0);
  });

  it("replays a client request through the unique constraint without rewarding twice", async () => {
    mocks.replay = {
      id: "comment-existing",
      cardId: "card-1",
      content: "정말 좋은 글이에요",
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      authorKind: "student",
      authorUser: null,
      authorStudent: { id: "student-1", name: "학생" },
    };

    const response = await POST(request(), { params: Promise.resolve({ id: "card-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).item.id).toBe("comment-existing");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("does not replay a deleted comment for the same client request", async () => {
    mocks.replay = {
      id: "comment-deleted",
      cardId: "card-1",
      content: "정말 좋은 글이에요",
      deletedAt: new Date("2026-07-21T00:00:00.000Z"),
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      authorKind: "student",
      authorUser: null,
      authorStudent: { id: "student-1", name: "학생" },
    };

    const response = await POST(request(), { params: Promise.resolve({ id: "card-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect((await response.json()).item.id).toBe("comment-1");
  });

  it("allows the same client request key on a different card", async () => {
    mocks.replay = {
      id: "comment-existing",
      cardId: "card-1",
      content: "정말 좋은 글이에요",
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      authorKind: "student",
      authorUser: null,
      authorStudent: { id: "student-1", name: "학생" },
    };

    const response = await POST(request(), { params: Promise.resolve({ id: "card-2" }) });
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cardId: "card-2" }) }),
    );
  });

  it("preserves a student comment's internal whitespace while rewarding its normalized meaning", async () => {
    mocks.award.mockResolvedValueOnce({ amount: 5, baseAmount: 5, buffBps: 0 });
    const response = await POST(
      request("request-0002", "  정말\n  좋은 글이에요  "),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "정말\n  좋은 글이에요" }),
      }),
    );
    expect(mocks.award).toHaveBeenCalledTimes(1);
  });

  it("preserves a teacher comment's internal whitespace without applying a reward", async () => {
    mocks.actor = { kind: "teacher", id: "teacher-1", name: "교사" };
    const response = await POST(
      request("request-0003", "  안내\n  문장입니다  "),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "안내\n  문장입니다" }),
      }),
    );
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("does not reward a normalized duplicate after more than 100 earlier comments", async () => {
    mocks.existingContents.push(
      ...Array.from({ length: 101 }, (_, index) => `서로 다른 댓글 ${index}`),
      "정말   좋은 글이에요",
    );
    await POST(
      request("request-0004", "정말\n좋은 글이에요"),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(mocks.loadPreparedRewardContext).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("creates a parent comment only in the guardian audience without broadcasting it", async () => {
    mocks.actor = { kind: "parent", id: "parent-1", name: "보호자" };

    const response = await POST(
      request("parent-request-1", "아이에게 남기는 댓글", "guardian"),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audience: "guardian",
          authorKind: "external",
          authorParentId: "parent-1",
          authorStudentId: null,
          authorUserId: null,
        }),
      }),
    );
    expect((await response.json()).item.authorKind).toBe("parent");
    expect(mocks.award).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  it("rejects a legacy/default public comment from a parent", async () => {
    mocks.actor = { kind: "parent", id: "parent-1", name: "보호자" };

    const response = await POST(request("parent-request-2", "공개 댓글 시도"), {
      params: Promise.resolve({ id: "card-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects guardian comments when the actor does not own the private thread", async () => {
    mocks.guardianAvailable = false;

    const response = await POST(
      request("request-guardian-denied", "보호자 댓글 시도", "guardian"),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps replies to replies in the original flat thread", async () => {
    mocks.replyTarget = {
      id: "reply-1",
      parentCommentId: "root-1",
    };

    const response = await POST(
      request("reply-request-1", "같은 스레드에 남기는 답글", "public", "reply-1"),
      { params: Promise.resolve({ id: "card-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentCommentId: "root-1" }),
      }),
    );
  });
});
