import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => {
  const jobs = Object.fromEntries(["findMany", "findUnique", "findUniqueOrThrow", "findFirst", "count", "create", "update", "updateMany", "deleteMany"].map(key => [key, vi.fn()]));
  return { jobs, access: vi.fn(), transaction: vi.fn(), lock: vi.fn(), download: vi.fn(), remove: vi.fn(), store: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: { songGuessImport: mocks.jobs, $transaction: mocks.transaction } }));
vi.mock("@/lib/play-platform/actor", () => ({
  loadSongGuessTeacherBoard: mocks.access,
  PlayAccessError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("@/lib/media-storage", () => ({ downloadPrivateObject: mocks.download, deletePrivateObject: mocks.remove }));
vi.mock("./server", () => ({ storeSongGuessClip: mocks.store }));
import { deleteSongGuessImport, editSongGuessImport, enqueueSongGuessImport, listSongGuessImports, materializeSongGuessImport } from "./import-server";

const boardId = "board-a", id = "job-a", link = "https://youtu.be/dQw4w9WgXcQ?t=0";
function wav() {
  const bytes = Buffer.alloc(44 + 44100 * 15 * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(88200, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ actor: { userId: "teacher" } });
  mocks.transaction.mockImplementation(async callback => callback({ songGuessImport: mocks.jobs, $executeRaw: mocks.lock }));
  mocks.jobs.count.mockResolvedValue(0);
});

describe("teacher import boundaries", () => {
  it.each([
    ["list", () => listSongGuessImports(boardId)],
    ["enqueue", () => enqueueSongGuessImport(boardId, link)],
    ["edit", () => editSongGuessImport(boardId, id, "Title", "Artist")],
    ["materialize", () => materializeSongGuessImport(boardId, id)],
    ["delete", () => deleteSongGuessImport(boardId, id)],
  ] as const)("denied %s never reaches jobs or audio", async (_name, operation) => {
    const denied = new Error("forbidden");
    mocks.access.mockRejectedValue(denied);
    await expect(operation()).rejects.toBe(denied);
    expect(mocks.access).toHaveBeenCalledWith(boardId);
    expect(mocks.transaction).not.toHaveBeenCalled();
    for (const call of Object.values(mocks.jobs)) expect(call).not.toHaveBeenCalled();
    for (const call of [mocks.download, mocks.remove, mocks.store]) expect(call).not.toHaveBeenCalled();
  });

  it("does not expose another board's jobs", async () => {
    mocks.jobs.findMany.mockResolvedValue([]);
    await expect(listSongGuessImports(boardId)).resolves.toEqual([]);
    expect(mocks.jobs.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { boardId }, take: 100 }));
  });

  it.each(["materialize", "edit", "delete"])("cross-board %s cannot use a foreign job", async operation => {
    const foreign = { id, boardId: "board-b", status: "ready", objectKey: "foreign.wav", title: "Title", artist: "Artist" };
    mocks.jobs.findFirst.mockImplementation(async ({ where }) => where.id === foreign.id && where.boardId === foreign.boardId ? foreign : null);
    mocks.jobs.updateMany.mockImplementation(async ({ where }) => ({ count: Number(where.id === foreign.id && where.boardId === foreign.boardId) }));
    const run = operation === "materialize" ? materializeSongGuessImport(boardId, id)
      : operation === "edit" ? editSongGuessImport(boardId, id, "Changed", "Changed") : deleteSongGuessImport(boardId, id);
    await expect(run).rejects.toMatchObject({ status: operation === "materialize" ? 409 : 404 });
    expect(foreign.title).toBe("Title");
    for (const call of [mocks.download, mocks.remove, mocks.store, mocks.jobs.deleteMany, mocks.jobs.findUniqueOrThrow]) expect(call).not.toHaveBeenCalled();
  });

  it("rejects missing identity and invalid links before transaction", async () => {
    mocks.access.mockResolvedValueOnce({ actor: {} });
    await expect(enqueueSongGuessImport(boardId, link)).rejects.toMatchObject({ status: 403 });
    await expect(enqueueSongGuessImport(boardId, "https://evil.test/?t=0")).rejects.toMatchObject({ status: 400 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([[100, 0], [0, 5], [101, 6]])("rejects new imports at total=%i pending=%i", async (total, pending) => {
    mocks.jobs.count.mockResolvedValueOnce(total).mockResolvedValueOnce(pending);
    await expect(enqueueSongGuessImport(boardId, link)).rejects.toMatchObject({ status: 429 });
    expect(mocks.jobs.create).not.toHaveBeenCalled();
    expect(mocks.lock).toHaveBeenCalledOnce();
  });

  it("creates below both quotas with canonical identity and requester", async () => {
    mocks.jobs.count.mockResolvedValueOnce(99).mockResolvedValueOnce(4);
    await enqueueSongGuessImport(boardId, link);
    expect(mocks.jobs.create).toHaveBeenCalledWith(expect.objectContaining({ data: {
      boardId, requestedByUserId: "teacher", videoId: "dQw4w9WgXcQ", startSeconds: 0,
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0",
    } }));
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.jobs.findUnique.mock.invocationCallOrder[0]);
  });

  it.each(["queued", "processing", "ready", "failed"])("does not restart %s at the attempt limit", async status => {
    mocks.jobs.findUnique.mockResolvedValue({ id, status, attempts: 3 });
    mocks.jobs.findUniqueOrThrow.mockResolvedValue({ id, status });
    await expect(enqueueSongGuessImport(boardId, link)).resolves.toEqual({ id, status });
    expect(mocks.jobs.update).not.toHaveBeenCalled();
    expect(mocks.jobs.create).not.toHaveBeenCalled();
  });

  it("retries failed jobs without resetting attempts", async () => {
    mocks.jobs.count.mockResolvedValue(0);
    mocks.jobs.findUnique.mockResolvedValue({ id, status: "failed", attempts: 2 });
    await enqueueSongGuessImport(boardId, link);
    expect(mocks.jobs.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id },
      data: { status: "queued", error: null, requestedByUserId: "teacher" } }));
    expect(mocks.jobs.count).toHaveBeenCalledWith({ where: { boardId, status: { in: ["queued", "processing"] } } });
    expect(mocks.jobs.count.mock.invocationCallOrder[0]).toBeLessThan(mocks.jobs.update.mock.invocationCallOrder[0]);
  });

  it("retry honors the five-pending-job quota", async () => {
    mocks.jobs.findUnique.mockResolvedValue({ id, status: "failed", attempts: 1 });
    mocks.jobs.count.mockImplementation(async ({ where }) => where.status ? 5 : 10);
    await expect(enqueueSongGuessImport(boardId, link)).rejects.toMatchObject({ status: 429 });
    expect(mocks.jobs.update).not.toHaveBeenCalled();
  });

  it("blocks incomplete metadata before downloading", async () => {
    mocks.jobs.findFirst.mockResolvedValue({ objectKey: "clip.wav", title: "", artist: "Artist" });
    await expect(materializeSongGuessImport(boardId, id)).rejects.toMatchObject({ status: 409 });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(["size", "hash", "format"])("rejects corrupt %s before clip storage", async kind => {
    const bytes = kind === "format" ? Buffer.from("invalid wav") : wav();
    mocks.jobs.findFirst.mockResolvedValue({ objectKey: "clip.wav", title: "Title", artist: "Artist",
      sizeBytes: bytes.length + Number(kind === "size"), sha256: kind === "hash" ? "wrong" : createHash("sha256").update(bytes).digest("hex") });
    mocks.download.mockResolvedValue({ body: bytes });
    await expect(materializeSongGuessImport(boardId, id)).rejects.toMatchObject({ status: 409, message: "song_guess_import_audio_invalid" });
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("materializes verified audio into the authorized board", async () => {
    const bytes = wav();
    mocks.jobs.findFirst.mockResolvedValue({ objectKey: "clip.wav", title: "Title", artist: "Artist",
      sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    mocks.download.mockResolvedValue({ body: bytes });
    mocks.store.mockResolvedValue({ id: "clip" });
    await expect(materializeSongGuessImport(boardId, id)).resolves.toEqual({ title: "Title", artist: "Artist", clip: { id: "clip" } });
    expect(mocks.store).toHaveBeenCalledWith(boardId, expect.any(File), expect.objectContaining({ tierMs: 15000, sizeBytes: bytes.length }));
  });

  it.each([true, false])("does not delete an object when processing wins (already=%s)", async already => {
    mocks.jobs.findFirst.mockResolvedValue({ status: already ? "processing" : "queued", objectKey: "clip.wav" });
    mocks.jobs.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteSongGuessImport(boardId, id)).rejects.toMatchObject({ status: 409 });
    expect(mocks.remove).not.toHaveBeenCalled();
    if (!already) expect(mocks.jobs.deleteMany).toHaveBeenCalledWith({ where: { id, boardId, status: { not: "processing" } } });
  });

  it("deletes only the selected row's audio after row deletion", async () => {
    mocks.jobs.findFirst.mockResolvedValue({ status: "ready", objectKey: "own.wav" });
    mocks.jobs.deleteMany.mockResolvedValue({ count: 1 });
    await deleteSongGuessImport(boardId, id);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("own.wav");
    expect(mocks.jobs.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  });
});
