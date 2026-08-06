import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/db", () => ({
  db: {
    studentNotification: {
      count: mocks.count,
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

import { GET, POST } from "./route";

describe("/api/student/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "class-1" });
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([{
      sourceId: "comment-1",
      kind: "comment",
      actorLabel: "김 선생님",
      title: "게시물에 새 댓글이 달렸어요",
      cardTitle: "여름 일기",
      boardTitle: "우리 반",
      href: "/board/class-board",
      content: "잘했어요",
      createdAt: new Date("2026-07-31T00:00:00.000Z"),
      readAt: null,
    }]);
    mocks.findUnique.mockResolvedValue({ id: "notification-1" });
    mocks.update.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses one bounded count and one bounded list query while preserving shape", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { studentId: "student-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: expect.objectContaining({ sourceId: true, kind: true, title: true, readAt: true }),
    });
    await expect(response.json()).resolves.toEqual({
      count: 1,
      items: [{
        id: "comment:comment-1",
        kind: "comment",
        actorLabel: "김 선생님",
        title: "게시물에 새 댓글이 달렸어요",
        cardTitle: "여름 일기",
        boardTitle: "우리 반",
        href: "/board/class-board",
        content: "잘했어요",
        createdAt: "2026-07-31T00:00:00.000Z",
        read: false,
      }],
    });
  });

  it("marks one owned notification by the existing kind/source id contract", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "mark_read", kind: "comment", id: "comment-1" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: {
        studentId_kind_sourceId: {
          studentId: "student-1",
          kind: "comment",
          sourceId: "comment-1",
        },
      },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "notification-1" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("marks all persisted rows without reconstructing source tables", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "mark_all_read" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { studentId: "student-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
