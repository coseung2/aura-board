import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeParentFeedCursor,
  encodeParentMergedFeedCursor,
} from "@/lib/parent-feed-cursor";

const mocks = vi.hoisted(() => ({
  studentFindMany: vi.fn(),
  cardFindMany: vi.fn(),
  queryRaw: vi.fn(),
  withParentScope: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    student: { findMany: mocks.studentFindMany },
    card: { findMany: mocks.cardFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/parent-scope", () => ({
  withParentScope: mocks.withParentScope,
}));

vi.mock("@/lib/portfolio-card-mapper", () => ({
  mapPortfolioCard: (card: { id: string; createdAt?: Date }) => ({
    id: card.id,
    ...(card.createdAt ? { createdAt: card.createdAt.toISOString() } : {}),
  }),
}));

vi.mock("@/lib/portfolio-acl-pure", () => ({
  EXCLUDED_BOARD_LAYOUTS: ["dj-queue"],
}));

import { GET } from "./route";

const CHILDREN = [
  {
    id: "student_1",
    name: "아우라",
    number: 7,
    classroomId: "class_1",
    classroom: { name: "1반" },
  },
  {
    id: "student_2",
    name: "보드",
    number: 8,
    classroomId: "class_1",
    classroom: { name: "1반" },
  },
];

describe("GET /api/parent/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withParentScope.mockImplementation(
      async (_req: Request, fn: (ctx: unknown) => Promise<unknown>) =>
        fn({
          childLinks: [
            { studentId: "student_1" },
            { studentId: "student_2" },
          ],
        }),
    );
    mocks.studentFindMany.mockResolvedValue(CHILDREN);
    mocks.cardFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("rejects an invalid cursor before resolving parent scope", async () => {
    const res = await GET(
      new Request("https://example.test/api/parent/feed?cursor=bad+cursor"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_cursor" });
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.withParentScope).not.toHaveBeenCalled();
  });

  it("returns one deduplicated card with every matching linked child", async () => {
    const first = {
      id: "card_shared",
      createdAt: new Date("2026-07-10T02:00:00.000Z"),
      studentAuthorId: "student_1",
      authors: [{ studentId: "student_1" }, { studentId: "student_2" }],
      imageUrl: "https://cdn.example.test/shared.jpg",
      thumbUrl: null,
      videoUrl: null,
      linkImage: null,
      attachments: [],
    };
    const extra = {
      id: "card_extra",
      createdAt: new Date("2026-07-10T01:00:00.000Z"),
      studentAuthorId: "student_2",
      authors: [],
      imageUrl: null,
      thumbUrl: null,
      videoUrl: null,
      linkImage: null,
      attachments: [],
    };
    mocks.cardFindMany.mockResolvedValue([first, extra]);

    const res = await GET(
      new Request("https://example.test/api/parent/feed?limit=1"),
    );
    const body = await res.json();

    expect(mocks.studentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["student_1", "student_2"] } },
      }),
    );
    const query = mocks.cardFindMany.mock.calls[0][0];
    expect(query.where.AND[0]).toEqual({
      OR: [
        { studentAuthorId: { in: ["student_1", "student_2"] } },
        {
          authors: {
            some: { studentId: { in: ["student_1", "student_2"] } },
          },
        },
      ],
    });
    expect(query.where.AND[1]).toEqual({
      OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }],
    });
    expect(query.where.board).toEqual({ layout: { notIn: ["dj-queue"] } });
    expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(query.take).toBe(2);
    expect(body.items).toEqual([
      {
        id: "card_shared",
        createdAt: first.createdAt.toISOString(),
        contentKind: "media",
        linkedChildren: [
          {
            id: "student_1",
            name: "아우라",
            number: 7,
            classroomId: "class_1",
            classroomName: "1반",
          },
          {
            id: "student_2",
            name: "보드",
            number: 8,
            classroomId: "class_1",
            classroomName: "1반",
          },
        ],
      },
    ]);
    expect(body.nextCursor).toBe(
      encodeParentMergedFeedCursor({
        card: { createdAt: first.createdAt, id: first.id },
        publication: null,
      }),
    );
    expect(body).not.toHaveProperty("child");
  });

  it("merges published feed posts with card posts in one time-ordered stream", async () => {
    const card = {
      id: "card_old",
      createdAt: new Date("2026-07-10T02:00:00.000Z"),
      studentAuthorId: "student_1",
      authors: [],
      imageUrl: null,
      thumbUrl: null,
      videoUrl: null,
      linkImage: null,
      attachments: [],
    };
    mocks.cardFindMany.mockResolvedValue([card]);
    mocks.queryRaw.mockResolvedValue([
      {
        publicationId: "pub_1",
        postId: "post_1",
        scope: "GLOBAL",
        classroomId: null,
        authorKind: "PLATFORM",
        authorDisplayName: "Aura Board",
        title: "공지",
        body: "새 소식",
        publishedAt: new Date("2026-08-11T00:00:00.000Z"),
        media: [],
      },
    ]);

    const res = await GET(
      new Request("https://example.test/api/parent/feed?limit=1"),
    );
    const body = await res.json();

    expect(mocks.queryRaw).toHaveBeenCalled();
    expect(body.items).toEqual([
      {
        source: "publication",
        id: "pub_1",
        authorKind: "PLATFORM",
        authorDisplayName: "Aura Board",
        title: "공지",
        body: "새 소식",
        scope: "GLOBAL",
        publishedAt: "2026-08-11T00:00:00.000Z",
        media: [],
      },
    ]);
    expect(body.nextCursor).toBe(
      encodeParentMergedFeedCursor({
        card: null,
        publication: {
          publishedAt: new Date("2026-08-11T00:00:00.000Z"),
          publicationId: "pub_1",
        },
      }),
    );
  });

  it("returns an empty page without querying cards when there are no active children", async () => {
    mocks.withParentScope.mockImplementationOnce(
      async (_req: Request, fn: (ctx: unknown) => Promise<unknown>) =>
        fn({ childLinks: [] }),
    );

    const res = await GET(new Request("https://example.test/api/parent/feed"));

    expect(await res.json()).toEqual({ items: [], nextCursor: null });
    expect(mocks.studentFindMany).not.toHaveBeenCalled();
    expect(mocks.cardFindMany).not.toHaveBeenCalled();
  });

  it("adds a createdAt/id keyset boundary and caps the limit", async () => {
    const createdAt = new Date("2026-07-10T02:00:00.000Z");
    const cursor = encodeParentFeedCursor({ createdAt, id: "card_b" });

    await GET(
      new Request(
        `https://example.test/api/parent/feed?limit=100&cursor=${cursor}`,
      ),
    );

    const query = mocks.cardFindMany.mock.calls[0][0];
    expect(query.where.AND).toContainEqual({
      OR: [
        { createdAt: { lt: createdAt } },
        { createdAt, id: { lt: "card_b" } },
      ],
    });
    expect(query.take).toBe(25);
  });

  it("applies private no-store headers to scope errors", async () => {
    mocks.withParentScope.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(new Request("https://example.test/api/parent/feed"));

    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(res.headers.get("vary")).toBe("Cookie, Authorization");
  });
});
