import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  consumeSlimeCookie: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  consumeSlimeCookie: mocks.consumeSlimeCookie,
  isSlimeServiceError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && "status" in error),
}));

import { POST } from "./route";

function request(body: unknown, key?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (key) headers.set("Idempotency-Key", key);
  return new Request("https://example.test/api/student/slimes/items/consume", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/slimes/items/consume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.consumeSlimeCookie.mockResolvedValue({
      itemKey: "slime-cookie",
      remainingQuantity: 1,
      growth: { stage: 1, growthSeconds: 17_280, remainingSeconds: 846_720 },
    });
  });

  it("requires the student session, idempotency key, and cookie payload", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const unauthenticated = await POST(request({ itemKey: "slime-cookie", color: "blue" }, "use-1"));
    expect(unauthenticated.status).toBe(401);

    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    const missingKey = await POST(request({ itemKey: "slime-cookie", color: "blue" }));
    expect(missingKey.status).toBe(400);
    expect(mocks.consumeSlimeCookie).not.toHaveBeenCalled();
  });

  it("passes only authenticated identity and returns the normal growth snapshot", async () => {
    const response = await POST(
      request({ itemKey: "slime-cookie", color: "blue", studentId: "other" }, "cookie-use-1"),
    );
    expect(response.status).toBe(200);
    expect(mocks.consumeSlimeCookie).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "slime-cookie",
      "blue",
      "cookie-use-1",
    );
    expect(await response.json()).toMatchObject({
      itemKey: "slime-cookie",
      remainingQuantity: 1,
      growth: { growthSeconds: 17_280 },
    });
  });

  it("maps service ownership errors", async () => {
    mocks.consumeSlimeCookie.mockRejectedValue({ code: "not_owned", status: 403 });
    const response = await POST(request({ itemKey: "slime-cookie", color: "blue" }, "cookie-use-2"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_owned" });
  });
});
