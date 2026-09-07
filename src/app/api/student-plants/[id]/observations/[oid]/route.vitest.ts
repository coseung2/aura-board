import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), update: vi.fn(), remove: vi.fn(), broadcast: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/card-broadcast-queue", () => ({ scheduleCardChangeBroadcast: mocks.broadcast }));
vi.mock("@/lib/plant-auth", () => ({ resolvePlantActor: async () => ({ kind: "teacher", userId: "teacher-1" }), canAccessStudentPlant: mocks.gate }));
vi.mock("@/lib/db", () => ({ db: {
  plantObservation: { findUnique: async () => ({ id: "obs-1", studentPlantId: "plant-1", stageId: "stage-1", memo: "new", observedAt: new Date(), images: [] }), delete: mocks.remove },
  $transaction: mocks.transaction,
} }));
import { PATCH, DELETE } from "./route";
const context = { params: Promise.resolve({ id: "plant-1", oid: "obs-1" }) };

describe("plant journal cross-client delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue({ ok: true, boardId: "board-1", ownedByActor: false });
    mocks.transaction.mockImplementation(async (operation) => operation({ plantObservation: { update: mocks.update } }));
  });
  it("publishes a safe board invalidation after editing an observation", async () => {
    const response = await PATCH(new Request("http://localhost/observation", { method: "PATCH", body: JSON.stringify({ memo: "new" }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.broadcast).toHaveBeenCalledWith("board-1", "update");
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.broadcast.mock.invocationCallOrder[0]);
  });
  it("publishes after deleting, without leaking the private journal payload", async () => {
    const response = await DELETE(new Request("http://localhost/observation", { method: "DELETE" }), context);
    expect(response.status).toBe(204);
    expect(mocks.broadcast).toHaveBeenCalledWith("board-1", "update");
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.broadcast.mock.invocationCallOrder[0]);
  });
  it("does not mutate or broadcast when classroom access is denied", async () => {
    mocks.gate.mockResolvedValue({ ok: false, status: 403 });
    expect((await DELETE(new Request("http://localhost/observation", { method: "DELETE" }), context)).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});
