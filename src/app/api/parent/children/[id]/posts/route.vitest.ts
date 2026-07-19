import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  studentFindMany: vi.fn(),
  cardFindMany: vi.fn(),
  withParentScopeForStudent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    student: { findMany: mocks.studentFindMany },
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

describe("GET /api/parent/children/[id]/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withParentScopeForStudent.mockImplementation(
      async (_req: Request, _studentId: string, fn: () => Promise<unknown>) =>
        fn(),
    );
    mocks.studentFindMany.mockResolvedValue([
      {
        id: "student_1",
        name: "아우라",
        number: 7,
        classroomId: "class_1",
        classroom: { name: "1반" },
      },
    ]);
    mocks.cardFindMany.mockResolvedValue([
      {
        id: "card_1",
        createdAt: new Date("2026-07-10T02:00:00.000Z"),
        studentAuthorId: "student_1",
        authors: [],
        imageUrl: null,
        thumbUrl: null,
        videoUrl: null,
        linkImage: null,
        attachments: [],
      },
    ]);
  });

  it("scopes the request to the route child and returns the neutral post shape", async () => {
    const req = new Request(
      "https://example.test/api/parent/children/student_1/posts",
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: "student_1" }),
    });
    const body = await res.json();

    expect(mocks.withParentScopeForStudent).toHaveBeenCalledWith(
      req,
      "student_1",
      expect.any(Function),
    );
    expect(mocks.cardFindMany.mock.calls[0][0].where.AND[0]).toEqual({
      OR: [
        { studentAuthorId: { in: ["student_1"] } },
        { authors: { some: { studentId: { in: ["student_1"] } } } },
      ],
    });
    expect(body).toEqual({
      child: {
        id: "student_1",
        name: "아우라",
        number: 7,
        classroomId: "class_1",
        classroomName: "1반",
      },
      items: [
        {
          id: "card_1",
          contentKind: "text",
          linkedChildren: [
            {
              id: "student_1",
              name: "아우라",
              number: 7,
              classroomId: "class_1",
              classroomName: "1반",
            },
          ],
        },
      ],
      nextCursor: null,
    });
  });

  it("preserves a cross-child 403 and private cache headers", async () => {
    mocks.withParentScopeForStudent.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "forbidden_student" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET(
      new Request("https://example.test/api/parent/children/student_2/posts"),
      { params: Promise.resolve({ id: "student_2" }) },
    );

    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(res.headers.get("vary")).toBe("Cookie, Authorization");
  });

  it("applies media and text filters in the database query before pagination", async () => {
    await GET(
      new Request(
        "https://example.test/api/parent/children/student_1/posts?kind=media",
      ),
      { params: Promise.resolve({ id: "student_1" }) },
    );
    const mediaQuery = mocks.cardFindMany.mock.calls[0][0];
    expect(mediaQuery.where.AND).toContainEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { imageUrl: { not: null } },
          { videoUrl: { not: null } },
          {
            attachments: {
              some: {
                OR: [
                  { kind: { in: ["image", "video"] } },
                  { previewUrl: { not: null } },
                ],
              },
            },
          },
        ]),
      }),
    );
    expect(mediaQuery.take).toBe(13);

    await GET(
      new Request(
        "https://example.test/api/parent/children/student_1/posts?kind=text",
      ),
      { params: Promise.resolve({ id: "student_1" }) },
    );
    const textQuery = mocks.cardFindMany.mock.calls[1][0];
    expect(textQuery.where.AND).toContainEqual(
      expect.objectContaining({ NOT: expect.any(Object) }),
    );
    expect(textQuery.take).toBe(13);
  });

  it("rejects an invalid kind before resolving parent scope", async () => {
    const res = await GET(
      new Request(
        "https://example.test/api/parent/children/student_1/posts?kind=audio",
      ),
      { params: Promise.resolve({ id: "student_1" }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_kind" });
    expect(mocks.withParentScopeForStudent).not.toHaveBeenCalled();
  });

  it("returns 404 when an active link no longer has a student row", async () => {
    mocks.studentFindMany.mockResolvedValueOnce([]);

    const res = await GET(
      new Request("https://example.test/api/parent/children/student_1/posts"),
      { params: Promise.resolve({ id: "student_1" }) },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "child_not_found" });
    expect(mocks.cardFindMany).not.toHaveBeenCalled();
  });
});
