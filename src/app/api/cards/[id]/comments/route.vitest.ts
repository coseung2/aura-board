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
  } as { kind: "student"; id: string; name: string; classroomId: string } | { kind: "teacher"; id: string; name: string },
  existingContents: [] as string[],
  replay: null as Record<string, unknown> | null,
  award: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/card-engagement-actor", () => ({
  getCurrentCardActor: vi.fn(async () => mocks.actor),
  authorizeCardAccess: vi.fn(async () => ({
    ok: true,
    ctx: { classroomId: "classroom-1", anonymousAuthor: false },
  })),
}));

vi.mock("@/lib/bank", () => ({
  ensureAccountFor: vi.fn(async () => ({ accountId: "account-1", cardId: "card-1" })),
}));

vi.mock("@/lib/reward-service", () => ({
  loadRewardPolicy: vi.fn(async () => ({
    commentMinMeaningfulLength: 4,
    commentRewardAmount: 5,
  })),
  awardCappedPolicyReward: mocks.award,
}));

vi.mock("@/lib/creatures/activity-rewards", () => ({
  retryActivityRewardTransaction: (operation: () => Promise<unknown>) => operation(),
}));

vi.mock("@/lib/card-engagement-format", () => ({
  formatEngagementAuthor: ({ name }: { name: string }) => name,
}));
vi.mock("@/lib/realtime-broadcast", () => ({ announceEngagementChange: vi.fn() }));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: vi.fn() }));

vi.mock("@/lib/db", () => {
  const tx = {
    cardComment: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const key = where.authorStudentId_cardId_clientRequestId as
          | { cardId?: string }
          | undefined;
        return mocks.replay?.cardId === key?.cardId ? mocks.replay : null;
      }),
      findMany: vi.fn(async () => mocks.existingContents.map((content) => ({ content }))),
      create: mocks.create,
    },
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
) {
  return new Request("http://localhost/api/cards/card-1/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, clientRequestId }),
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
    mocks.award.mockReset();
    mocks.create.mockReset();
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: "comment-1",
        ...data,
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        authorUser: null,
        authorStudent: { id: "student-1", name: "학생" },
      };
      mocks.comments.push(row);
      return row;
    });
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

  it("replays a client request without creating or rewarding a second comment", async () => {
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
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.award).not.toHaveBeenCalled();
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

    const tx = (await import("@/lib/db")).db;
    expect(tx.cardComment.findMany).toHaveBeenCalledWith({
      where: { authorStudentId: "student-1" },
      select: { content: true },
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.award).not.toHaveBeenCalled();
  });
});
