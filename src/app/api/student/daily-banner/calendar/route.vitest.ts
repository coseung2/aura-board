import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  getCurrentStudentRaw: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
  getCurrentStudentRaw: mocks.getCurrentStudentRaw,
}));

vi.mock("@/lib/db", () => ({
  db: {
    dailyBannerPublication: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/daily-banner", () => ({
  parseKstDay: (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : null,
  kstDayToDate: (value: string) => new Date(`${value}T00:00:00.000Z`),
  dateToKstDay: (value: Date) => value.toISOString().slice(0, 10),
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

describe("GET /api/student/daily-banner/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({
      id: "cookie-student",
      classroomId: "classroom-cookie",
    });
    mocks.getCurrentStudentRaw.mockResolvedValue({
      id: "bearer-student",
      classroomId: "classroom-bearer",
    });
    mocks.findMany.mockResolvedValue([
      { day: new Date("2026-07-04T00:00:00.000Z") },
    ]);
  });

  it("uses the mobile Bearer session even when a teacher session cookie exists", async () => {
    const response = await GET(
      new Request(
        "https://aura-board.example/api/student/daily-banner/calendar?month=2026-07",
        { headers: { Authorization: "Bearer mobile-token" } },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getCurrentStudentRaw).toHaveBeenCalledTimes(1);
    expect(mocks.getCurrentStudent).not.toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classroomId: "classroom-bearer" }),
      }),
    );
    expect(await response.json()).toEqual({
      month: "2026-07",
      occupiedDays: ["2026-07-04"],
    });
  });
});
