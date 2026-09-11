import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), fetch: vi.fn(), clip: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { songGuessCatalogClip: { findUnique: mocks.clip } } }));
vi.mock("@/lib/play-platform/actor", () => ({ resolveSongGuessActorForSession: mocks.actor, PlayAccessError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
vi.mock("@/lib/play-platform/server-client", () => ({ playEngineFetch: mocks.fetch }));
vi.mock("@/lib/media-storage", () => ({ downloadPrivateObject: mocks.download }));
import { loadCatalogSessionClip } from "./student-room-audio";
const snapshot = () => ({
  sessionId: "s1", boardId: "b1", gameKind: "song-guess", version: 1, serverTimeMs: 1000,
  rulesVersion: 2, stateSchemaVersion: 2, previousSessionId: null, roomMode: "student-free", phase: "guessing",
  currentRound: { roundId: "r1", order: 0, accessibilityClue: null, revealedAnswer: null, startedAtMs: 1000, deadlineAtMs: 31000, maxScore: 1000,
    currentClip: { assetId: "a1", tierMs: 15000, mimeType: "audio/wav", durationMs: 15000, sizeBytes: 3 } },
  participants: [], viewer: { role: "participant", joined: true, scoredCurrentRound: false },
});
describe("student room catalog audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ role: "participant", subject: "student:1" });
    mocks.fetch.mockResolvedValue(Response.json(snapshot()));
    mocks.clip.mockResolvedValue({ objectKey: `song-guess/catalog/s1/highlight/${"a".repeat(64)}.wav`, mimeType: "audio/wav", sizeBytes: 3 });
    mocks.download.mockResolvedValue({ body: new Uint8Array([1, 2, 3]) });
  });
  it("serves only the currently unlocked asset through an authorized snapshot", async () => {
    const response = await loadCatalogSessionClip("s1", "a1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it.each(["not_joined", "wrong_asset", "wrong_phase", "foreign_actor"])("denies %s before private storage lookup", async (scenario) => {
    const value = snapshot();
    if (scenario === "not_joined") value.viewer.joined = false;
    if (scenario === "wrong_phase") value.phase = "lobby";
    mocks.fetch.mockResolvedValue(Response.json(value, { status: scenario === "foreign_actor" ? 403 : 200 }));
    await expect(loadCatalogSessionClip("s1", scenario === "wrong_asset" ? "other" : "a1")).rejects.toMatchObject({ status: 403 });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.clip).not.toHaveBeenCalled();
  });
});
