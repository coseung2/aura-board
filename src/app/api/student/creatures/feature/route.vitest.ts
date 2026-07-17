import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  featureCreature: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/creatures/service", () => ({
  featureBodySchema: {
    safeParse: (value: unknown) => {
      const body = value as { creatureId?: unknown };
      return typeof body?.creatureId === "string" && body.creatureId.trim()
        ? { success: true, data: { creatureId: body.creatureId.trim() } }
        : { success: false };
    },
  },
  featureCreature: mocks.featureCreature,
  isCreatureServiceError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && "status" in error),
}));

import { POST } from "./route";

describe("POST /api/student/creatures/feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.featureCreature.mockResolvedValue({ featured: { id: "creature-1" } });
  });

  it("requires a student session", async () => {
    mocks.getCurrentStudent.mockRejectedValue(new Error("expired"));
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ creatureId: "creature-1" }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.featureCreature).not.toHaveBeenCalled();
  });

  it("uses only the authenticated student's identity", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ creatureId: "creature-1" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.featureCreature).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "creature-1",
    );
  });
});
