import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), students: vi.fn(), slimes: vi.fn(), results: vi.fn(), engine: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  playSession: { findUnique: mocks.session }, student: { findMany: mocks.students },
  studentSlime: { findMany: mocks.slimes }, gameResult: { findMany: mocks.results },
} }));
vi.mock("@/lib/play-platform/actor", () => ({ resolvePlayActorForSession: vi.fn().mockResolvedValue({ subject: "student:a" }) }));
vi.mock("@/lib/play-platform/server-client", () => ({
  playEngineFetch: mocks.engine, proxyPlayEngineResponse: (response: Response) => response,
}));
vi.mock("@/lib/play-platform/route-utils", () => ({
  playRouteError: () => new Response(null, { status: 500 }),
}));

import { GET } from "./route";
const equipment = ["hat", "drink", "food", "prop", "vehicle", "background", "floor"];
const read = () => GET(new Request("http://localhost/api/play/sessions/session/players"), {
  params: Promise.resolve({ sessionId: "session" }),
});
const session = (gameKind = "omok") => ({
  gameKind, board: { classroomId: "class-a" }, startedAtMs: 10n,
  participants: [
    { studentId: "a", actorSubject: "student:old", displayName: "동명이인", slot: "first" },
    { studentId: null, actorSubject: "student:b", displayName: "동명이인", slot: "second" },
  ],
});

describe("Omok representative player pets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.engine.mockResolvedValue(new Response("{}"));
    mocks.session.mockResolvedValue(session());
    mocks.students.mockResolvedValue([{ id: "b", name: "동명이인", number: 2 }, { id: "a", name: "동명이인", number: 1 }]);
    mocks.slimes.mockResolvedValue(["b", "a"].map((studentId) => ({
      studentId, color: studentId === "a" ? "pink" : "blue", growthStage: 3,
      equippedItemKeys: equipment, hiddenItemKeys: ["hat"],
    })));
    mocks.results.mockResolvedValue([]);
  });

  it("uses stored student ID or legacy student subject, scopes the current classroom, and preserves full equipment", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.players.map((p: { studentId: string; pet: { color: string } }) => [p.studentId, p.pet.color]))
      .toEqual([["a", "pink"], ["b", "blue"]]);
    expect(body.players[0].pet).toMatchObject({ equippedItemKeys: equipment, hiddenItemKeys: ["hat"] });
    expect(body.players[0].pet.equippedFloor).toBeTypeOf("string");
    expect(mocks.students).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["a", "b"] }, classroomId: "class-a" },
    }));
    expect(mocks.slimes).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: { in: ["a", "b"] }, classroomId: "class-a", student: { classroomId: "class-a" }, isRepresentative: true },
      select: expect.objectContaining({ equippedItemKeys: true, hiddenItemKeys: true }),
    }));
  });

  it("never attaches a pet to a student absent from the current classroom", async () => {
    mocks.students.mockResolvedValue([{ id: "a", name: "동명이인", number: 1 }]);
    const body = await (await read()).json();
    expect(body.players[1].pet).toBeNull();
  });

  it("does not load identities or pets for anonymous Shadow Alliance sessions", async () => {
    mocks.session.mockResolvedValue(session("shadow-alliance"));
    expect((await read()).status).toBe(404);
    expect(mocks.students).not.toHaveBeenCalled();
    expect(mocks.slimes).not.toHaveBeenCalled();
    expect(mocks.results).not.toHaveBeenCalled();
  });

  it("does not load profiles when the engine rejects session access", async () => {
    mocks.engine.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await read()).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.slimes).not.toHaveBeenCalled();
  });
});
