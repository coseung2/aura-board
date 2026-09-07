import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), board: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db", () => ({ db: { board: { findFirst: mocks.board } } }));
vi.mock("@/lib/rbac", () => ({ requirePermission: mocks.permission, ForbiddenError: class extends Error {} }));
import { GET, PATCH } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AURA_ADMIN_EMAILS", "pilot@example.com");
  mocks.user.mockResolvedValue({ id: "normal", email: "normal@example.com" });
  mocks.board.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("generic board API cannot bypass layout rollout", () => {
  it.each([GET, PATCH])("filters unreleased boards before reads or settings updates", async (handler) => {
    const response = await handler(new Request("http://localhost/api/boards/board", { method: "PATCH" }), { params: Promise.resolve({ id: "board" }) });
    expect(response.status).toBe(404);
    const layouts = mocks.board.mock.calls[0][0].where.layout.in;
    expect(layouts).toContain("freeform");
    expect(layouts).toContain("grid");
    expect(layouts).not.toContain("stream");
    expect(layouts).not.toContain("omok");
    expect(mocks.permission).not.toHaveBeenCalled();
  });
});
