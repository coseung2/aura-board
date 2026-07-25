import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "teacher-1" },
  classroomFindUnique: vi.fn(),
  reportFindFirst: vi.fn(),
  commentFindUnique: vi.fn(),
  commentUpdateMany: vi.fn(),
  reportUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => mocks.user),
}));

vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findUnique: mocks.classroomFindUnique },
    contentReport: { findFirst: mocks.reportFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

describe("teacher content report moderation", () => {
  beforeEach(() => {
    mocks.classroomFindUnique.mockReset();
    mocks.reportFindFirst.mockReset();
    mocks.commentFindUnique.mockReset();
    mocks.commentUpdateMany.mockReset();
    mocks.reportUpdate.mockReset();
    mocks.transaction.mockReset();
    mocks.classroomFindUnique.mockResolvedValue({ teacherId: "teacher-1" });
    mocks.reportFindFirst.mockResolvedValue({
      id: "report-1",
      targetKind: "comment",
      targetId: "root-1",
    });
    mocks.commentFindUnique.mockResolvedValue({ parentCommentId: null });
    mocks.commentUpdateMany.mockResolvedValue({ count: 3 });
    mocks.reportUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        cardComment: {
          findUnique: mocks.commentFindUnique,
          updateMany: mocks.commentUpdateMany,
        },
        contentReport: { update: mocks.reportUpdate },
      }),
    );
  });

  it("soft-deletes a reported root and its direct replies in one moderation transaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/classrooms/classroom-1/content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: "report-1", action: "remove" }),
      }),
      { params: Promise.resolve({ id: "classroom-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.commentUpdateMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: "root-1" }, { parentCommentId: "root-1" }],
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mocks.reportUpdate).toHaveBeenCalledTimes(1);
  });
});
