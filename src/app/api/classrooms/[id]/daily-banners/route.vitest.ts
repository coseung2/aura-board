import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindUnique: vi.fn(),
  submissionFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFindUnique },
    dailyBannerSubmission: { findMany: mocks.submissionFindMany },
  },
}));

vi.mock("@/lib/daily-banner", () => ({
  getKstDay: () => "2026-07-16",
  parseKstDay: (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : null,
  kstDayToDate: (value: string) => new Date(`${value}T00:00:00.000Z`),
  serializeDailyBannerSubmission: (row: { id: string; targetDay: Date }) => ({
    id: row.id,
    targetDay: row.targetDay.toISOString().slice(0, 10),
  }),
}));

vi.mock("@/lib/http-cache", () => ({
  jsonPrivateNoStore: (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    }),
}));

import { GET } from "./route";

describe("GET /api/classrooms/:id/daily-banners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFindUnique.mockResolvedValue({
      id: "classroom-1",
      teacherId: "teacher-1",
    });
    mocks.submissionFindMany.mockResolvedValue([
      {
        id: "submission-1",
        targetDay: new Date("2026-07-15T00:00:00.000Z"),
      },
    ]);
  });

  it("returns all submissions in a requested month", async () => {
    const response = await GET(
      new Request(
        "https://aura-board.example/api/classrooms/classroom-1/daily-banners?month=2026-07&status=all",
      ),
      { params: Promise.resolve({ id: "classroom-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.submissionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classroomId: "classroom-1",
          targetDay: {
            gte: new Date("2026-07-01T00:00:00.000Z"),
            lte: new Date("2026-07-31T00:00:00.000Z"),
          },
        }),
      }),
    );
    expect(await response.json()).toEqual({
      classroomId: "classroom-1",
      month: "2026-07",
      targetDay: null,
      status: "all",
      submissions: [{ id: "submission-1", targetDay: "2026-07-15" }],
    });
  });

  it("rejects an invalid month instead of falling back to today", async () => {
    const response = await GET(
      new Request(
        "https://aura-board.example/api/classrooms/classroom-1/daily-banners?month=2026-13&status=all",
      ),
      { params: Promise.resolve({ id: "classroom-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_month" });
    expect(mocks.submissionFindMany).not.toHaveBeenCalled();
  });
});
