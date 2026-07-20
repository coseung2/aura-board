import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  setRepresentativeSlime: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pets/service")>("@/lib/pets/service");
  return { ...actual, setRepresentativeSlime: mocks.setRepresentativeSlime };
});

import { SlimeServiceError } from "@/lib/pets/service";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://example.test/api/student/slimes/representative", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/slimes/representative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
  });

  it("sets an owned slime as representative", async () => {
    mocks.setRepresentativeSlime.mockResolvedValue({ representativeColor: "purple" });

    const response = await POST(request({ color: "purple" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ representativeColor: "purple" });
    expect(mocks.setRepresentativeSlime).toHaveBeenCalledWith(
      { id: "student-1", classroomId: "classroom-1" },
      "purple",
    );
  });

  it("rejects invalid input and non-owned slimes", async () => {
    expect((await POST(request({}))).status).toBe(400);
    mocks.setRepresentativeSlime.mockRejectedValue(new SlimeServiceError("not_owned"));
    const response = await POST(request({ color: "red" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "not_owned" });
  });
});
