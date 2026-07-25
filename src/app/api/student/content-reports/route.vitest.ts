import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  reportUpsert: vi.fn(),
  targetUpsert: vi.fn(),
  authorUpsert: vi.fn(),
  resolveTarget: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(async () => ({ id: "student-1", classroomId: "classroom-1" })),
}));

vi.mock("@/lib/content-safety-service", () => ({
  resolveReportTarget: mocks.resolveTarget,
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/student/content-reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      targetKind: "card",
      targetId: "card-1",
      reason: "profanity",
      hideAuthor: true,
    }),
  });
}

describe("student content reports", () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
    mocks.reportUpsert.mockReset();
    mocks.targetUpsert.mockReset();
    mocks.authorUpsert.mockReset();
    mocks.resolveTarget.mockReset();
    mocks.resolveTarget.mockResolvedValue({
      classroomId: "classroom-1",
      authorStudentId: "student-2",
      authorLabel: "학생 2",
      contentSnapshot: "신고 내용",
    });
    mocks.reportUpsert.mockResolvedValue({ id: "report-1" });
    mocks.targetUpsert.mockResolvedValue({});
    mocks.authorUpsert.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        contentReport: { upsert: mocks.reportUpsert },
        hiddenContent: { upsert: mocks.targetUpsert },
        hiddenContentAuthor: { upsert: mocks.authorUpsert },
      }),
    );
  });

  it("writes the report and both hide records through one transaction", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.reportUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.targetUpsert).toHaveBeenCalledWith({
      where: {
        studentId_targetKind_targetId: {
          studentId: "student-1",
          targetKind: "card",
          targetId: "card-1",
        },
      },
      update: { viaReport: true },
      create: { studentId: "student-1", targetKind: "card", targetId: "card-1", viaReport: true },
    });
    expect(mocks.authorUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_hiddenStudentId: { studentId: "student-1", hiddenStudentId: "student-2" } },
        create: expect.objectContaining({ reportId: "report-1" }),
      }),
    );
  });
});
