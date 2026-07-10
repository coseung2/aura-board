import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeParentFeedCursor } from "@/lib/parent-feed-cursor";

const mocks = vi.hoisted(() => ({
  studentFindUnique: vi.fn(),
  cardFindMany: vi.fn(),
  withParentScopeForStudent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    student: { findUnique: mocks.studentFindUnique },
    card: { findMany: mocks.cardFindMany },
  },
}));

vi.mock("@/lib/parent-scope", () => ({
  withParentScopeForStudent: mocks.withParentScopeForStudent,
}));

vi.mock("@/lib/portfolio-card-mapper", () => ({
  mapPortfolioCard: (card: { id: string }) => ({ id: card.id }),
}));

vi.mock("@/lib/portfolio-acl-pure", () => ({
  EXCLUDED_BOARD_LAYOUTS: ["dj-queue"],
}));

import { GET } from "./route";

describe("GET /api/parent/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withParentScopeForStudent.mockImplementation(
      async (_req: Request, _studentId: string, fn: () => Promise<unknown>) =>
        fn(),
    );
    mocks.studentFindUnique.mockResolvedValue({
      id: "student_1",
      name: "아우라",
      number: 7,
      classroomId: "class_1",
      classroom: { name: "1반" },
    });
    mocks.cardFindMany.mockResolvedValue([]);
  });

  it("rejects an invalid cursor before resolving parent scope", async () => {
    const res = await GET(
      new Request(
        "https://example.test/api/parent/feed?childId=student_1&cursor=bad+cursor",
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_cursor" });
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.withParentScopeForStudent).not.toHaveBeenCalled();
  });

  it("uses the parent child scope and returns a bounded first page", async () => {
    const first = { id: "card_b", createdAt: new Date("2026-07-10T02:00:00.000Z") };
    const extra = { id: "card_a", createdAt: new Date("2026-07-10T01:00:00.000Z") };
    mocks.cardFindMany.mockResolvedValue([first, extra]);
    const req = new Request(
      "https://example.test/api/parent/feed?childId=student_1&limit=1",
    );

    const res = await GET(req);
    const body = await res.json();

    expect(mocks.withParentScopeForStudent).toHaveBeenCalledWith(
      req,
      "student_1",
      expect.any(Function),
    );
    const query = mocks.cardFindMany.mock.calls[0][0];
    expect(query).toEqual(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2,
      }),
    );
    expect(query.where.AND).toEqual([
      {
        OR: [
          { studentAuthorId: "student_1" },
          { authors: { some: { studentId: "student_1" } } },
        ],
      },
      { OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }] },
    ]);
    expect(query.where.board).toEqual({
      layout: { notIn: ["dj-queue"] },
    });
    expect(body.child).toEqual({
      id: "student_1",
      name: "아우라",
      number: 7,
      classroomId: "class_1",
      classroomName: "1반",
    });
    expect(body.items).toEqual([{ id: "card_b" }]);
    expect(body.nextCursor).toBe(
      encodeParentFeedCursor({ createdAt: first.createdAt, id: first.id }),
    );
  });

  it("adds a createdAt/id keyset boundary for subsequent pages", async () => {
    const createdAt = new Date("2026-07-10T02:00:00.000Z");
    const cursor = encodeParentFeedCursor({ createdAt, id: "card_b" });

    await GET(
      new Request(
        `https://example.test/api/parent/feed?childId=student_1&cursor=${cursor}`,
      ),
    );

    const query = mocks.cardFindMany.mock.calls[0][0];
    expect(query.where.AND).toContainEqual({
      OR: [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lt: "card_b" } },
      ],
    });
    expect(query.take).toBe(13);
  });

  it("caps the requested limit at 24", async () => {
    await GET(
      new Request(
        "https://example.test/api/parent/feed?childId=student_1&limit=100",
      ),
    );

    expect(mocks.cardFindMany.mock.calls[0][0].take).toBe(25);
  });

  it("applies private no-store headers to scope errors", async () => {
    mocks.withParentScopeForStudent.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "forbidden_student" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(
      new Request("https://example.test/api/parent/feed?childId=student_2"),
    );

    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(res.headers.get("vary")).toBe("Cookie, Authorization");
  });
});
