import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patch: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/api/cards/[id]/route", () => ({ PATCH: mocks.patch, DELETE: mocks.remove }));
import { PATCH, DELETE } from "./route";
const context = { params: Promise.resolve({ cardId: "card-1" }) };
function request(method: string, body: unknown) { return new Request("http://localhost/api/share/cards/card-1", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

describe("legacy share card compatibility", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue(new Response("{}")); mocks.remove.mockResolvedValue(new Response("{}")); });
  it.each([["PATCH", PATCH], ["DELETE", DELETE]] as const)("%s cannot authorize ownership from a display name", async (method, handler) => {
    const response = await handler(request(method, { shareToken: "token", authorName: "known name" }), context);
    expect(response.status).toBe(403);
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("forwards a guest-key edit to the canonical permission and broadcast path", async () => {
    await PATCH(request("PATCH", { shareToken: "token", guestId: "guest-a", title: "updated" }), context);
    const [forwarded, target] = mocks.patch.mock.calls[0];
    expect(forwarded.headers.get("x-share-token")).toBe("token");
    expect(forwarded.headers.get("x-share-guest-id")).toBe("guest-a");
    expect(await target.params).toEqual({ id: "card-1" });
  });
});
