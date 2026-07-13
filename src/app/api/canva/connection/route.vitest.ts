import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  disconnectTeacherCanva: vi.fn(),
  isCanvaConnected: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/canva", () => ({
  disconnectTeacherCanva: mocks.disconnectTeacherCanva,
  isCanvaConnected: mocks.isCanvaConnected,
}));

import { DELETE, GET } from "./route";

function deleteRequest(origin = "https://aura-board.com") {
  return new Request("https://aura-board.com/api/canva/connection", {
    method: "DELETE",
    headers: { Origin: origin },
  });
}

describe("/api/canva/connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.disconnectTeacherCanva.mockResolvedValue(true);
  });

  it("returns the current teacher connection status privately", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.isCanvaConnected.mockResolvedValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ connected: true, actor: "teacher" });
    expect(mocks.isCanvaConnected).toHaveBeenCalledWith("teacher-1");
  });

  it("disconnects only the authenticated teacher account", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    expect(mocks.disconnectTeacherCanva).toHaveBeenCalledWith("teacher-1");
  });

  it("rejects cross-origin disconnect attempts before authentication", async () => {
    const response = await DELETE(deleteRequest("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.disconnectTeacherCanva).not.toHaveBeenCalled();
  });

  it("does not report success when Canva revocation fails", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.disconnectTeacherCanva.mockResolvedValue(false);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });

  it("rejects unauthenticated status and disconnect requests", async () => {
    const statusResponse = await GET();
    const deleteResponse = await DELETE(deleteRequest());

    expect(statusResponse.status).toBe(401);
    expect(deleteResponse.status).toBe(401);
  });
});
