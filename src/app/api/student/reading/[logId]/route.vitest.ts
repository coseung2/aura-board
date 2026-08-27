import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  student: { id: "student-1", classroomId: "classroom-1" } as Record<string, string> | null,
  log: null as Record<string, unknown> | null,
  revisionCreate: vi.fn(),
  logFindFirst: vi.fn(),
  logUpdate: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: vi.fn(() => mocks.student) }));
vi.mock("@/lib/db", () => ({
  db: {
    readingLog: {
      findFirst: mocks.logFindFirst,
      update: mocks.logUpdate,
    },
    $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      readingLogRevision: { create: mocks.revisionCreate },
      readingLog: { update: mocks.logUpdate },
    })),
  },
}));

import { PATCH } from "./route";

const baseLog = () => ({
  id: "log-1", classroomId: "classroom-1", studentId: "student-1", bookType: "story",
  title: "이전 책", author: "이전 작가", reflection: "이전 감상", aiScore: 5,
  aiFeedback: "좋은 감상이에요", aiFeedbackStatus: "generated", aiFeedbackModel: "gemma",
  aiFeedbackError: null, evaluatedAt: new Date("2026-08-20T00:00:00Z"),
  missionCounted: true, missionCountedAt: new Date("2026-08-20T01:00:00Z"),
  currentRevision: 1, createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), updatedAt: new Date(),
});

function request(body: unknown) {
  return new Request("http://localhost/api/student/reading/log-1", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("PATCH reading log", () => {
  beforeEach(() => {
    mocks.student = { id: "student-1", classroomId: "classroom-1" };
    mocks.log = baseLog();
    mocks.logFindFirst.mockReset().mockImplementation(async () => mocks.log);
    mocks.revisionCreate.mockReset().mockResolvedValue({});
    mocks.logUpdate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseLog(), ...data, currentRevision: 2, updatedAt: new Date("2026-08-21T00:00:00Z") }));
  });

  it("returns 404 for a non-owner or other classroom", async () => {
    mocks.logFindFirst.mockResolvedValue(null);
    const response = await PATCH(request({ bookType: "story", title: "책", author: "작가", reflection: "감상" }), { params: Promise.resolve({ logId: "log-1" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "reading_log_not_found" });
  });

  it("matches POST validation", async () => {
    const response = await PATCH(request({ bookType: "poem", title: "책", author: "작가", reflection: "감상" }), { params: Promise.resolve({ logId: "log-1" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_book_type");
  });

  it("rejects logs older than seven days", async () => {
    mocks.log = { ...baseLog(), createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) };
    const response = await PATCH(request({ bookType: "story", title: "책", author: "작가", reflection: "감상" }), { params: Promise.resolve({ logId: "log-1" }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("reading_log_edit_window_expired");
  });

  it("snapshots and resets evaluation without changing mission accounting", async () => {
    const response = await PATCH(request({ bookType: "comic", title: "새 책", author: "새 작가", reflection: "새 감상" }), { params: Promise.resolve({ logId: "log-1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.revisionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ revision: 1, aiScore: 5, aiFeedback: "좋은 감상이에요" }) });
    expect(mocks.logUpdate).toHaveBeenCalledWith({ where: { id: "log-1" }, data: expect.objectContaining({ currentRevision: { increment: 1 }, aiScore: null, aiFeedbackStatus: "pending" }) });
    expect(mocks.logUpdate.mock.calls[0][0].data).not.toHaveProperty("missionCounted");
    expect(mocks.logUpdate.mock.calls[0][0].data).not.toHaveProperty("missionCountedAt");
    expect(body.entry).toMatchObject({ title: "새 책", aiScore: null, aiFeedback: null, aiFeedbackStatus: "pending", currentRevision: 2 });
    expect(body.entry).not.toHaveProperty("missionCounted");
  });
});
