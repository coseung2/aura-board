import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), lock: vi.fn(), reap: vi.fn(), count: vi.fn(), pending: vi.fn(), claim: vi.fn(),
  board: vi.fn(), editor: vi.fn(), finish: vi.fn(), upload: vi.fn(), remove: vi.fn(),
  mkdtemp: vi.fn(), readFile: vi.fn(), rm: vi.fn(), spawn: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction,
  board: { findUnique: mocks.board }, boardMember: { findFirst: mocks.editor },
  songGuessImport: { updateMany: mocks.finish },
} }));
vi.mock("@/lib/media-storage", () => ({ uploadPrivateObject: mocks.upload, deletePrivateObject: mocks.remove }));
vi.mock("node:fs/promises", () => {
  const fs = { mkdtemp: mocks.mkdtemp, readFile: mocks.readFile, rm: mocks.rm };
  return { ...fs, default: fs };
});
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
import { extractSongGuessLink, processNextSongGuessImport } from "./import-worker";

const pending = { id: "job-a", boardId: "board-a", requestedByUserId: "teacher", videoId: "dQw4w9WgXcQ", startSeconds: 12, attempts: 0 };
const now = new Date("2026-09-08T00:00:00Z");
function wav() {
  const bytes = Buffer.alloc(44 + 44100 * 15 * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(88200, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
function childResult(text = '{"title":" Title ","artist":" Artist "}', code = 0) {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill: vi.fn(), pid: undefined });
  queueMicrotask(() => { child.stdout.emit("data", Buffer.from(text)); child.emit("close", code); });
  return child;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(now);
  mocks.transaction.mockImplementation(async callback => callback({ $executeRaw: mocks.lock,
    songGuessImport: { updateMany: mocks.reap, count: mocks.count, findFirst: mocks.pending, update: mocks.claim } }));
  mocks.count.mockResolvedValue(0);
  mocks.pending.mockResolvedValue({ ...pending });
  mocks.claim.mockImplementation(async ({ data }) => ({ ...pending, ...data, attempts: 1 }));
  mocks.mkdtemp.mockResolvedValue("/mock/song-link-temp");
  mocks.board.mockResolvedValue({ classroom: { teacherId: "teacher" } });
  mocks.editor.mockResolvedValue(null);
  mocks.spawn.mockImplementation(() => childResult());
  mocks.readFile.mockResolvedValue(wav());
  mocks.upload.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.rm.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("import worker lease and storage boundaries", () => {
  it.each([2, 3])("global running count %i stops board-scoped claims and extraction", async running => {
    mocks.count.mockResolvedValue(running);
    await expect(processNextSongGuessImport("board-a")).resolves.toEqual({ outcome: "idle" });
    expect(mocks.count).toHaveBeenCalledWith({ where: { status: "processing", leaseUntil: { gte: now } } });
    for (const call of [mocks.pending, mocks.claim, mocks.mkdtemp, mocks.spawn, mocks.upload]) expect(call).not.toHaveBeenCalled();
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.count.mock.invocationCallOrder[0]);
  });

  it("has no filesystem or extraction activity with an empty queue", async () => {
    mocks.pending.mockResolvedValue(null);
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "idle" });
    expect(mocks.pending.mock.calls[0][0].where).not.toHaveProperty("boardId");
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.mkdtemp).not.toHaveBeenCalled();
  });

  it("reaps exhausted leases and claims an eligible job with a fresh five-minute token", async () => {
    await expect(processNextSongGuessImport("board-a")).resolves.toEqual({ outcome: "ready" });
    expect(mocks.reap).toHaveBeenCalledWith({ where: { status: "processing", leaseUntil: { lt: now }, attempts: { gte: 3 } },
      data: expect.objectContaining({ status: "failed", leaseToken: null, leaseUntil: null }) });
    expect(mocks.pending).toHaveBeenCalledWith({ where: { boardId: "board-a", attempts: { lt: 3 },
      OR: [{ status: "queued" }, { status: "processing", leaseUntil: { lt: now } }] }, orderBy: { createdAt: "asc" } });
    const claim = mocks.claim.mock.calls[0][0];
    expect(claim).toEqual({ where: { id: pending.id }, data: { status: "processing", error: null,
      attempts: { increment: 1 }, leaseToken: expect.any(String), leaseUntil: new Date(now.getTime() + 300000) } });
    const token = claim.data.leaseToken;
    const key = `song-guess/imports/board-a/job-a/${token}.wav`;
    const bytes = await mocks.readFile.mock.results[0].value as Buffer;
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls[0][0]).toBe(key);
    expect(mocks.upload.mock.calls[0][1]).toBe(bytes);
    expect(mocks.upload.mock.calls[0][2]).toEqual({ contentType: "audio/wav" });
    expect(mocks.finish).toHaveBeenCalledWith({ where: { id: pending.id, status: "processing", leaseToken: token },
      data: { status: "ready", title: "Title", artist: "Artist", objectKey: key, sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"), leaseToken: null, leaseUntil: null } });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalledExactlyOnceWith("/mock/song-link-temp", { recursive: true, force: true });
  });

  it.each(["missing-board", "revoked-owner"])("revoked authority (%s) prevents extraction and audio I/O", async reason => {
    mocks.board.mockResolvedValue(reason === "missing-board" ? null : { classroom: { teacherId: "other" } });
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "failed" });
    for (const call of [mocks.spawn, mocks.readFile, mocks.upload, mocks.remove]) expect(call).not.toHaveBeenCalled();
    expect(mocks.finish.mock.calls[0][0].where).toEqual({ id: pending.id, status: "processing", leaseToken: mocks.claim.mock.calls[0][0].data.leaseToken });
    expect(mocks.rm).toHaveBeenCalledOnce();
  });

  it("permits a current editor and checks only owner/editor membership", async () => {
    mocks.board.mockResolvedValue({ classroom: null });
    mocks.editor.mockResolvedValue({ id: "membership" });
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "ready" });
    expect(mocks.editor).toHaveBeenCalledWith({ where: { boardId: "board-a", userId: "teacher", role: { in: ["owner", "editor"] } }, select: { id: true } });
  });

  it.each(["new-lease", "already-ready"])("cleans superseded upload without overwriting %s", async reason => {
    const current = { status: reason === "already-ready" ? "ready" : "processing", leaseToken: "new-token", objectKey: "newer.wav", title: "New title" };
    mocks.finish.mockImplementation(async ({ where, data }) => {
      if (current.status !== where.status || current.leaseToken !== where.leaseToken) return { count: 0 };
      Object.assign(current, data);
      return { count: 1 };
    });
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "superseded" });
    expect(current).toMatchObject({ objectKey: "newer.wav", title: "New title", leaseToken: "new-token" });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.upload.mock.calls[0][0]);
    expect(mocks.remove).not.toHaveBeenCalledWith("newer.wav");
    expect(mocks.finish).toHaveBeenCalledOnce();
    expect(mocks.rm).toHaveBeenCalledOnce();
  });

  it.each(["extraction", "invalid-wav", "read", "upload", "publish"])("cleans failed %s and fences its failure update", async stage => {
    if (stage === "extraction") mocks.spawn.mockImplementation(() => childResult("private failure", 1));
    if (stage === "invalid-wav") mocks.readFile.mockResolvedValue(Buffer.from("bad"));
    if (stage === "read") mocks.readFile.mockRejectedValue(new Error("private path"));
    if (stage === "upload") mocks.upload.mockRejectedValue(new Error("storage failed"));
    if (stage === "publish") mocks.finish.mockRejectedValueOnce(new Error("db failed")).mockResolvedValueOnce({ count: 1 });
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "failed" });
    const last = mocks.finish.mock.calls.at(-1)![0];
    expect(last.where).toEqual({ id: pending.id, status: "processing", leaseToken: mocks.claim.mock.calls[0][0].data.leaseToken });
    expect(last.data).toMatchObject({ status: "failed", leaseToken: null, leaseUntil: null });
    expect(last.data.error).not.toMatch(/private|storage failed|db failed/);
    expect(mocks.rm).toHaveBeenCalledOnce();
    if (stage === "publish") {
      expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(mocks.upload.mock.calls[0][0]);
      expect(mocks.finish.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    }
    else expect(mocks.remove).not.toHaveBeenCalled();
    if (["extraction", "invalid-wav", "read"].includes(stage)) expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("an old extractor failure cannot mark a newer ready result failed", async () => {
    const current = { status: "ready", leaseToken: null, objectKey: "winner.wav" };
    mocks.spawn.mockImplementation(() => childResult("", 1));
    mocks.finish.mockImplementation(async ({ where, data }) => {
      if (current.status !== where.status || current.leaseToken !== where.leaseToken) return { count: 0 };
      Object.assign(current, data); return { count: 1 };
    });
    await processNextSongGuessImport();
    expect(current).toEqual({ status: "ready", leaseToken: null, objectKey: "winner.wav" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("temp allocation failure releases the claimed lease", async () => {
    mocks.mkdtemp.mockRejectedValue(new Error("disk full"));
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "failed" });
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
    expect(mocks.rm).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("a committed ready row retains audio after a lost DB acknowledgement", async () => {
    const current = { status: "processing", leaseToken: "", objectKey: "" };
    mocks.claim.mockImplementation(async ({ data }) => {
      current.leaseToken = data.leaseToken;
      return { ...pending, ...data };
    });
    mocks.finish.mockImplementation(async ({ where, data }) => {
      if (current.status !== where.status || current.leaseToken !== where.leaseToken) return { count: 0 };
      Object.assign(current, data);
      // The server committed the write but the connection failed before acknowledgement.
      if (data.status === "ready") throw new Error("connection lost after commit");
      return { count: 1 };
    });
    await processNextSongGuessImport();
    expect(current.status).toBe("ready");
    expect(current.objectKey).toBe(mocks.upload.mock.calls[0][0]);
    expect(mocks.remove).not.toHaveBeenCalledWith(current.objectKey);
  });

  it("retains uploaded audio when both publication and failure acknowledgement are unknown", async () => {
    mocks.finish.mockRejectedValue(new Error("database unavailable"));
    await expect(processNextSongGuessImport()).resolves.toEqual({ outcome: "failed" });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.finish).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalledOnce();
  });
});

describe("extractor subprocess boundary (fully mocked)", () => {
  it("rejects a late successful close after the 180-second deadline", async () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), pid: undefined });
    mocks.spawn.mockReturnValue(child);
    const result = extractSongGuessLink(pending.videoId, 0, "/mock/clip.wav");
    const rejected = expect(result).rejects.toThrow("extraction_failed");
    await vi.advanceTimersByTimeAsync(180000);
    child.stdout.emit("data", Buffer.from('{"title":"Title","artist":"Artist"}'));
    child.emit("close", 0);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sanitizes spawn errors and clears the deadline", async () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), pid: undefined });
    mocks.spawn.mockReturnValue(child);
    const result = extractSongGuessLink(pending.videoId, 0, "/mock/clip.wav");
    const rejected = expect(result).rejects.toThrow("extraction_failed");
    child.emit("error", new Error("synthetic private path"));
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses canonical arguments and a restricted environment without a shell", async () => {
    vi.stubEnv("SONG_IMPORT_TEST_SECRET", "synthetic-secret");
    await expect(extractSongGuessLink(pending.videoId, 12, "/mock/clip.wav")).resolves.toEqual({ title: "Title", artist: "Artist" });
    const [, args, options] = mocks.spawn.mock.calls[0];
    expect(args.slice(1)).toEqual(["--video-id", pending.videoId, "--start-seconds", "12", "--output", "/mock/clip.wav"]);
    expect(options.shell).not.toBe(true);
    expect(options.env).not.toHaveProperty("SONG_IMPORT_TEST_SECRET");
    expect(options).toMatchObject({ windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  });

  it.each([["not json", 0], ["{}", 1], ["null", 0], ["{}\n{}", 0], ["x".repeat(32001), 0]])("rejects malformed/failed/oversized output (case %#)", async (text, code) => {
    mocks.spawn.mockImplementation(() => childResult(text, code));
    await expect(extractSongGuessLink(pending.videoId, 0, "/mock/clip.wav")).rejects.toThrow("extraction_failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
