import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  equipSlimeShopItem: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  equipSlimeShopItem: mocks.equipSlimeShopItem,
  isSlimeServiceError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && "status" in error),
}));

import { POST } from "./route";

function request(body: unknown, key?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (key) headers.set("Idempotency-Key", key);
  return new Request("https://example.test/api/student/slimes/items/equip", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/slimes/items/equip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.equipSlimeShopItem.mockResolvedValue({
      itemKey: "water-puddle-background",
      isEquipped: true,
      equippedItemKeys: ["water-puddle-background"],
      idempotent: false,
    });
  });

  it("keeps the route separate from purchase and requires the idempotency header", async () => {
    const response = await POST(request({ itemKey: "water-puddle-background", isEquipped: true }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
    expect(mocks.equipSlimeShopItem).not.toHaveBeenCalled();
  });

  it("passes only cookie-authenticated identity and the requested state", async () => {
    const response = await POST(
      request(
        { itemKey: "water-puddle-background", isEquipped: true, studentId: "other" },
        "equip-attempt-1",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.equipSlimeShopItem).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "water-puddle-background",
      true,
      "equip-attempt-1",
    );
    expect(await response.json()).toMatchObject({
      itemKey: "water-puddle-background",
      isEquipped: true,
    });
  });

  it("returns ownership and catalog validation errors", async () => {
    mocks.equipSlimeShopItem.mockRejectedValue({ code: "not_owned", status: 403 });
    const response = await POST(request({ itemKey: "water-puddle-background", isEquipped: true }, "equip-2"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_owned" });
  });
});
