import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  setSlimeShopItemHidden: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  setSlimeShopItemHidden: mocks.setSlimeShopItemHidden,
  isSlimeServiceError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && "status" in error),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://example.test/api/student/slimes/items/visibility", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/slimes/items/visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.setSlimeShopItemHidden.mockResolvedValue({
      slimeColor: "blue",
      itemKey: "water-puddle-background",
      isHidden: true,
      equippedItemKeys: ["water-puddle-background"],
      equippedItemsByColor: { blue: ["water-puddle-background"] },
      hiddenItemsByColor: { blue: ["water-puddle-background"] },
      idempotent: false,
    });
  });

  it("uses only the authenticated student identity", async () => {
    const response = await POST(request({
      slimeColor: "blue",
      itemKey: "water-puddle-background",
      isHidden: true,
      studentId: "other-student",
    }));

    expect(response.status).toBe(200);
    expect(mocks.setSlimeShopItemHidden).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "blue",
      "water-puddle-background",
      true,
    );
    expect(await response.json()).toMatchObject({
      hiddenItemsByColor: { blue: ["water-puddle-background"] },
      equippedItemKeys: ["water-puddle-background"],
    });
  });

  it("rejects malformed requests before calling the service", async () => {
    const response = await POST(request({
      slimeColor: "blue",
      itemKey: "water-puddle-background",
      isHidden: "yes",
    }));

    expect(response.status).toBe(400);
    expect(mocks.setSlimeShopItemHidden).not.toHaveBeenCalled();
  });

  it("maps ownership and equipped-state validation errors", async () => {
    mocks.setSlimeShopItemHidden.mockRejectedValue({ code: "not_owned", status: 403 });
    const response = await POST(request({
      slimeColor: "blue",
      itemKey: "water-puddle-background",
      isHidden: true,
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_owned" });
  });
});
