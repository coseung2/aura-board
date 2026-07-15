import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withParentScope: vi.fn(),
  findStudent: vi.fn(),
  getDailyBanner: vi.fn(),
  getKstDay: vi.fn(),
}));

vi.mock("@/lib/parent-scope", () => ({
  withParentScope: mocks.withParentScope,
}));

vi.mock("@/lib/db", () => ({
  db: {
    student: {
      findUnique: mocks.findStudent,
    },
  },
}));

vi.mock("@/lib/daily-banner", () => ({
  getDailyBanner: mocks.getDailyBanner,
  getKstDay: mocks.getKstDay,
}));

import { GET } from "./route";

describe("GET /api/parent/daily-banner/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getKstDay.mockReturnValue("2026-07-15");
    mocks.withParentScope.mockImplementation(
      async (
        _req: Request,
        callback: (ctx: {
          childIds: Set<string>;
          childLinks: Array<{ studentId: string }>;
        }) => Promise<Response>,
      ) =>
        callback({
          childIds: new Set(["student-1", "student-2"]),
          childLinks: [
            { studentId: "student-1" },
            { studentId: "student-2" },
          ],
        }),
    );
    mocks.findStudent.mockResolvedValue({ classroomId: "classroom-2" });
    mocks.getDailyBanner.mockResolvedValue({ id: "banner-2" });
  });

  it("uses the selected child's classroom", async () => {
    const response = await GET(
      new Request(
        "https://aura-board.example/api/parent/daily-banner/current?studentId=student-2",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.findStudent).toHaveBeenCalledWith({
      where: { id: "student-2" },
      select: { classroomId: true },
    });
    expect(mocks.getDailyBanner).toHaveBeenCalledWith(
      "classroom-2",
      "2026-07-15",
    );
    expect(await response.json()).toEqual({
      day: "2026-07-15",
      studentId: "student-2",
      classroomId: "classroom-2",
      banner: { id: "banner-2" },
    });
  });

  it("rejects a child outside the authenticated parent's active links", async () => {
    const response = await GET(
      new Request(
        "https://aura-board.example/api/parent/daily-banner/current?studentId=student-other",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.findStudent).not.toHaveBeenCalled();
    expect(mocks.getDailyBanner).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "forbidden_student" });
  });

  it("requires an explicit child when the parent has multiple active children", async () => {
    const response = await GET(
      new Request(
        "https://aura-board.example/api/parent/daily-banner/current",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.findStudent).not.toHaveBeenCalled();
    expect(mocks.getDailyBanner).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "student_id_required" });
  });

  it("uses the only active child when studentId is omitted", async () => {
    mocks.withParentScope.mockImplementationOnce(
      async (
        _req: Request,
        callback: (ctx: {
          childIds: Set<string>;
          childLinks: Array<{ studentId: string }>;
        }) => Promise<Response>,
      ) =>
        callback({
          childIds: new Set(["student-1"]),
          childLinks: [{ studentId: "student-1" }],
        }),
    );
    mocks.findStudent.mockResolvedValueOnce({ classroomId: "classroom-1" });

    const response = await GET(
      new Request(
        "https://aura-board.example/api/parent/daily-banner/current",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getDailyBanner).toHaveBeenCalledWith(
      "classroom-1",
      "2026-07-15",
    );
  });

  it("returns no banner when the parent has no active children", async () => {
    mocks.withParentScope.mockImplementationOnce(
      async (
        _req: Request,
        callback: (ctx: {
          childIds: Set<string>;
          childLinks: Array<{ studentId: string }>;
        }) => Promise<Response>,
      ) => callback({ childIds: new Set(), childLinks: [] }),
    );

    const response = await GET(
      new Request(
        "https://aura-board.example/api/parent/daily-banner/current",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.findStudent).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      day: "2026-07-15",
      banner: null,
    });
  });
});
