import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), classroom: vi.fn(), students: vi.fn(), catalog: vi.fn(), clips: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  classroom: { findUnique: mocks.classroom }, student: { findMany: mocks.students }, songGuessCatalogClip: { findMany: mocks.clips },
} }));
vi.mock("./catalog-db", () => ({ loadSongGuessCatalogFromDb: mocks.catalog }));
vi.mock("@/lib/play-platform/actor", () => ({
  resolveSongGuessActorForBoard: mocks.actor,
  PlayAccessError: class extends Error { constructor(public status: number, public code: string) { super(code); } },
}));
import { buildStudentRoomRequest, studentRoomCatalog } from "./student-rooms";

describe("student song rooms", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv("PLAY_ENGINE_ASSERTION_SECRET", "test-only-secret-at-least-32-characters");
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ actor: { role: "participant", studentId: "s1", subject: "student:s1" }, board: { classroomId: "c1" } });
    mocks.classroom.mockResolvedValue({ teacherId: "t1" });
    mocks.students.mockResolvedValue([{ id: "s1", name: "One" }, { id: "s2", name: "Two" }]);
    mocks.catalog.mockResolvedValue(["A", "B", "C", "D"].map((title, index) => ({
      id: `song${index}`, title, artist: "Artist", aliases: [], categories: ["classical"], sourceUrl: "https://example.com",
      clips: { highlight: { objectKey: `song-guess/catalog/song${index}/highlight/${"a".repeat(64)}.wav`, mimeType: "audio/wav", durationMs: 15000, sizeBytes: 300, sha256: "a".repeat(64) } },
    })));
    mocks.clips.mockResolvedValue([0, 1, 2, 3].map((index) => ({ id: `clip${index}`, songId: `song${index}`, mimeType: "audio/wav", durationMs: 15000, sizeBytes: 300 })));
  });
  const selection = { categories: ["classical" as const], segment: "highlight" as const, count: 2 };
  it("rebuilds the same private payload after a lost creation response", async () => {
    expect(await buildStudentRoomRequest("b1", "retry1", selection)).toEqual(await buildStudentRoomRequest("b1", "retry1", selection));
  });

  it("returns only category counts to students", async () => {
    const response = await studentRoomCatalog("b1");
    expect(Object.keys(response)).toEqual(["categories"]);
    expect(response.categories.find((category) => category.id === "classical")?.counts.highlight).toBe(4);
    expect(JSON.stringify(response)).not.toContain("sourceUrl");
    expect(JSON.stringify(response)).not.toContain("Artist");
  });
  it("builds trusted teacher ownership and classroom roster while host stays a participant", async () => {
    const request = await buildStudentRoomRequest("b1", "req1", selection);
    expect(request).toMatchObject({ roomMode: "student-free", classroomTeacherSubject: "teacher:t1", answerMode: "multiple-choice" });
    expect(request.participants).toContainEqual({ actorSubject: "student:s1", displayName: "One" });
    expect(request.rounds).toHaveLength(2);
    expect(request.rounds[0].choices).toHaveLength(4);
    expect(mocks.students).toHaveBeenCalledWith(expect.objectContaining({ where: { classroomId: "c1" } }));
  });
  it("does not expose a teacher creation path through the student endpoint", async () => {
    mocks.actor.mockResolvedValue({ actor: { role: "host" }, board: { classroomId: "c1" } });
    await expect(buildStudentRoomRequest("b1", "req1", selection)).rejects.toMatchObject({ status: 403 });
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("rejects a host absent from the scoped classroom roster", async () => {
    mocks.students.mockResolvedValue([{ id: "foreign", name: "Other" }]);
    await expect(buildStudentRoomRequest("b1", "req1", selection)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unavailable categories instead of creating an empty game", async () => {
    await expect(buildStudentRoomRequest("b1", "req1", { ...selection, count: 5 })).rejects.toMatchObject({ status: 400 });
  });
});
