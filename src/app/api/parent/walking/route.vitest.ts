import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withParentScope: vi.fn(),
  studentFindMany: vi.fn(),
  walkingFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    student: { findMany: mocks.studentFindMany },
    studentWalkingDailyStat: { findMany: mocks.walkingFindMany },
  },
}));

vi.mock("@/lib/parent-scope", () => ({
  withParentScope: mocks.withParentScope,
}));

import { GET } from "./route";

const LINKS = [
  { studentId: "student-2" },
  { studentId: "student-1" },
];

describe("GET /api/parent/walking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T03:00:00.000Z"));
    vi.clearAllMocks();
    mocks.withParentScope.mockImplementation(
      async (_req: Request, callback: (ctx: unknown) => Promise<Response>) =>
        callback({ childLinks: LINKS }),
    );
    mocks.studentFindMany.mockResolvedValue([
      {
        id: "student-1",
        name: "첫째",
        number: 1,
        classroom: { id: "class-1", name: "1반" },
      },
      {
        id: "student-2",
        name: "둘째",
        number: null,
        classroom: null,
      },
    ]);
    mocks.walkingFindMany.mockResolvedValue([
      {
        studentId: "student-1",
        day: new Date("2026-07-21T00:00:00.000Z"),
        steps: 2_000,
        distanceMeters: 1_500.5,
        syncedAt: new Date("2026-07-21T01:02:03.000Z"),
      },
      {
        studentId: "student-2",
        day: new Date("2026-07-20T00:00:00.000Z"),
        steps: 4_000,
        distanceMeters: 3_000,
        syncedAt: null,
      },
      {
        studentId: "student-1",
        day: new Date("2026-07-20T00:00:00.000Z"),
        steps: 1_000,
        distanceMeters: 700,
        syncedAt: "2026-07-20T02:00:00.000Z",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes authentication responses through withParentScope", async () => {
    mocks.withParentScope.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(new Request("https://example.test/api/parent/walking"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(mocks.withParentScope).toHaveBeenCalledTimes(1);
    expect(mocks.studentFindMany).not.toHaveBeenCalled();
    expect(mocks.walkingFindMany).not.toHaveBeenCalled();
  });

  it("scopes records to linked children, groups them, and preserves link/day order", async () => {
    const response = await GET(new Request("https://example.test/api/parent/walking"));
    const body = await response.json();

    expect(body.week).toEqual({
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      today: "2026-07-22",
    });
    expect(body.children).toEqual([
      {
        studentId: "student-2",
        name: "둘째",
        number: null,
        classroom: null,
        rows: [
          {
            day: "2026-07-20",
            steps: 4_000,
            distanceMeters: 3_000,
            syncedAt: null,
          },
        ],
      },
      {
        studentId: "student-1",
        name: "첫째",
        number: 1,
        classroom: { id: "class-1", name: "1반" },
        rows: [
          {
            day: "2026-07-20",
            steps: 1_000,
            distanceMeters: 700,
            syncedAt: "2026-07-20T02:00:00.000Z",
          },
          {
            day: "2026-07-21",
            steps: 2_000,
            distanceMeters: 1_500.5,
            syncedAt: "2026-07-21T01:02:03.000Z",
          },
        ],
      },
    ]);

    expect(mocks.studentFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["student-2", "student-1"] } },
      select: {
        id: true,
        name: true,
        number: true,
        classroom: { select: { id: true, name: true } },
      },
    });
    expect(mocks.walkingFindMany).toHaveBeenCalledWith({
      where: {
        studentId: { in: ["student-2", "student-1"] },
        day: {
          gte: new Date("2026-07-20T00:00:00.000Z"),
          lte: new Date("2026-07-22T00:00:00.000Z"),
        },
      },
      select: {
        studentId: true,
        day: true,
        steps: true,
        distanceMeters: true,
        syncedAt: true,
      },
      orderBy: [{ studentId: "asc" }, { day: "asc" }],
    });
  });

  it("returns an empty child list without querying linked data when there are no links", async () => {
    mocks.withParentScope.mockImplementationOnce(
      async (_req: Request, callback: (ctx: unknown) => Promise<Response>) =>
        callback({ childLinks: [] }),
    );

    const response = await GET(new Request("https://example.test/api/parent/walking"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      week: {
        weekStart: "2026-07-20",
        weekEnd: "2026-07-26",
        today: "2026-07-22",
      },
      children: [],
    });
    expect(mocks.studentFindMany).not.toHaveBeenCalled();
    expect(mocks.walkingFindMany).not.toHaveBeenCalled();
  });
});
