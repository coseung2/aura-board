import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  boardFindUnique: vi.fn(),
  assignmentSlotFindMany: vi.fn(),
  publish: vi.fn(),
  claimCooldown: vi.fn(),
  releaseCooldown: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findUnique: mocks.boardFindUnique },
    assignmentSlot: { findMany: mocks.assignmentSlotFindMany },
  },
}));
vi.mock("@/lib/realtime", () => ({
  assignmentChannelKey: (boardId: string) => `board:${boardId}:assignment`,
  publish: mocks.publish,
}));
vi.mock("@/lib/distributed-cooldown", () => ({
  claimDistributedCooldown: mocks.claimCooldown,
  releaseDistributedCooldown: mocks.releaseCooldown,
}));

import { POST } from "./route";

function request() {
  return POST(
    new Request("https://example.test/api/boards/board-reminder-test/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    { params: Promise.resolve({ id: "board-reminder-test" }) },
  );
}

describe("assignment reminder realtime delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.boardFindUnique.mockResolvedValue({
      id: "board-reminder-test",
      classroom: { teacherId: "teacher-1" },
    });
    mocks.assignmentSlotFindMany.mockResolvedValue([
      { studentId: "student-1" },
      { studentId: "student-2" },
    ]);
    mocks.claimCooldown.mockResolvedValue({
      ok: true,
      lease: { key: "hashed-key", token: "lease-token", backend: "redis" },
    });
    mocks.releaseCooldown.mockResolvedValue(true);
  });

  it("returns 503 truthfully and does not consume cooldown when Broadcast fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.publish.mockRejectedValueOnce(new Error("realtime unavailable"));

    const failed = await request();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "reminder_delivery_failed" });
    expect(mocks.releaseCooldown).toHaveBeenCalledWith({
      key: "hashed-key",
      token: "lease-token",
      backend: "redis",
    });

    mocks.publish.mockResolvedValueOnce(undefined);
    const retried = await request();
    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({
      remindedCount: 2,
      cooldownSeconds: 300,
    });
  });

  it("preserves distributed retry-after on a denied claim", async () => {
    mocks.claimCooldown.mockResolvedValueOnce({ ok: false, retryAfter: 173 });

    const response = await request();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("173");
    expect(await response.json()).toEqual({
      error: "reminder_cooldown",
      retryAfter: 173,
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the distributed cooldown is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claimCooldown.mockRejectedValueOnce(new Error("Redis unavailable"));

    const response = await request();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "reminder_cooldown_unavailable" });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
