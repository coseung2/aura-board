import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  purchaseSlime: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  purchaseSlime: mocks.purchaseSlime,
  isSlimeServiceError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && "status" in error),
}));

import { POST } from "./route";

function request(body: unknown, key?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (key) headers.set("Idempotency-Key", key);
  return new Request("https://example.test/api/student/slimes/purchase", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/slimes/purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.purchaseSlime.mockResolvedValue({ ownedColor: "blue", balance: 100, idempotent: false });
  });

  it("requires an idempotency header", async () => {
    const response = await POST(request({ color: "blue" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
    expect(mocks.purchaseSlime).not.toHaveBeenCalled();
  });

  it("passes only cookie-authenticated identity, color, and idempotency key", async () => {
    const response = await POST(request({ color: "blue", studentId: "other" }, "attempt-1"));
    expect(response.status).toBe(201);
    expect(mocks.purchaseSlime).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "blue",
      "attempt-1",
    );
    expect(await response.json()).toEqual({ ownedColor: "blue", balance: 100, idempotent: false });
  });

  it("returns typed service errors", async () => {
    mocks.purchaseSlime.mockRejectedValue({ code: "insufficient_funds", status: 402 });
    const response = await POST(request({ color: "red" }, "attempt-2"));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "insufficient_funds" });
  });
});
