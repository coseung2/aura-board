import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findClassroom: vi.fn(),
  listPublishedFeed: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ db: { classroom: { findFirst: mocks.findClassroom } } }));
vi.mock("@/lib/feed/repository", () => ({ listPublishedFeed: mocks.listPublishedFeed }));

import { GET } from "./route";

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.findClassroom.mockReset();
  mocks.listPublishedFeed.mockReset();
  mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1", email: "teacher@example.com" });
  mocks.listPublishedFeed.mockResolvedValue({ items: [], nextCursor: null });
});

describe("GET /api/teacher/feed", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/teacher/feed?scope=global"));
    expect(response.status).toBe(401);
    expect(mocks.listPublishedFeed).not.toHaveBeenCalled();
  });

  it("checks classroom ownership before listing a classroom feed", async () => {
    mocks.findClassroom.mockResolvedValue({ id: "class-1" });
    const response = await GET(new Request("http://localhost/api/teacher/feed?scope=classroom&classroomId=class-1&limit=12"));

    expect(response.status).toBe(200);
    expect(mocks.findClassroom).toHaveBeenCalledWith({
      where: { id: "class-1", teacherId: "teacher-1" },
      select: { id: true },
    });
    expect(mocks.listPublishedFeed).toHaveBeenCalledWith({
      scope: "CLASSROOM",
      classroomId: "class-1",
      limit: 12,
      cursor: null,
    });
  });

  it("rejects a classroom the teacher does not own", async () => {
    mocks.findClassroom.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/teacher/feed?scope=classroom&classroomId=class-2"));

    expect(response.status).toBe(403);
    expect(mocks.listPublishedFeed).not.toHaveBeenCalled();
  });

  it("allows authenticated teachers to preview the global feed without a classroom lookup", async () => {
    const response = await GET(new Request("http://localhost/api/teacher/feed?scope=global"));

    expect(response.status).toBe(200);
    expect(mocks.findClassroom).not.toHaveBeenCalled();
    expect(mocks.listPublishedFeed).toHaveBeenCalledWith({
      scope: "GLOBAL",
      classroomId: null,
      limit: 20,
      cursor: null,
    });
  });
});
