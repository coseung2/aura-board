import "server-only";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { uploadPrivateObject, deletePrivateObject } from "@/lib/media-storage";
import { validateSongGuessWavBytes } from "./contracts";

export async function extractSongGuessLink(videoId: string, startSeconds: number, output: string): Promise<{ title: string; artist: string }> {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV, ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "LANG", "HOME", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"].includes(key))) };
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ process.env.SONG_GUESS_PYTHON_PATH || (process.platform === "win32" ? "python" : "python3"), [
      path.join(process.cwd(), "scripts/song-guess-extract-link.py"), "--video-id", videoId,
      "--start-seconds", String(startSeconds), "--output", output,
    ], { env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "ignore"] });
    let text = "", failed = false;
    const stop = () => {
      failed = true;
      if (!child.pid) return;
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
      else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    };
    const timeout = setTimeout(stop, 180_000);
    child.stdout.on("data", chunk => { text += chunk.toString(); if (text.length > 32_000) stop(); });
    child.on("error", () => { clearTimeout(timeout); reject(new Error("extraction_failed")); });
    child.on("close", code => {
      clearTimeout(timeout);
      if (failed || code !== 0) { reject(new Error("extraction_failed")); return; }
      try {
        const result = JSON.parse(text);
        resolve({ title: typeof result.title === "string" ? result.title.trim().slice(0, 200) : "", artist: typeof result.artist === "string" ? result.artist.trim().slice(0, 200) : "" });
      } catch { reject(new Error("extraction_failed")); }
    });
  });
}

export async function processNextSongGuessImport(boardId?: string) {
  const now = new Date(), leaseToken = randomUUID();
  const job = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('song-import-workers'))`;
    await tx.songGuessImport.updateMany({ where: { status: "processing", leaseUntil: { lt: now }, attempts: { gte: 3 } }, data: { status: "failed", error: "가져오기가 중단됐어요. 링크를 다시 확인해 주세요.", leaseToken: null, leaseUntil: null } });
    const running = await tx.songGuessImport.count({ where: { status: "processing", leaseUntil: { gte: now } } });
    if (running >= 2) return null;
    const pending = await tx.songGuessImport.findFirst({
      where: { ...(boardId ? { boardId } : {}), attempts: { lt: 3 }, OR: [{ status: "queued" }, { status: "processing", leaseUntil: { lt: now } }] }, orderBy: { createdAt: "asc" },
    });
    if (!pending) return null;
    return tx.songGuessImport.update({ where: { id: pending.id }, data: { status: "processing", error: null, attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(now.getTime() + 300_000) } });
  });
  if (!job) return { outcome: "idle" };
  let directory: string | undefined;
  const objectKey = `song-guess/imports/${job.boardId}/${job.id}/${leaseToken}.wav`;
  let uploaded = false;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), "song-link-"));
    const board = await db.board.findUnique({ where: { id: job.boardId }, select: { classroom: { select: { teacherId: true } } } });
    const editor = await db.boardMember.findFirst({ where: { boardId: job.boardId, userId: job.requestedByUserId, role: { in: ["owner", "editor"] } }, select: { id: true } });
    if (!board || (board.classroom?.teacherId !== job.requestedByUserId && !editor)) throw new Error("forbidden");
    const output = path.join(directory, "clip.wav");
    const metadata = await extractSongGuessLink(job.videoId, job.startSeconds, output);
    const bytes = await readFile(output);
    if (validateSongGuessWavBytes(bytes, 15000)) throw new Error("invalid_wav");
    await uploadPrivateObject(objectKey, bytes, { contentType: "audio/wav" });
    uploaded = true;
    const updated = await db.songGuessImport.updateMany({ where: { id: job.id, status: "processing", leaseToken }, data: {
      status: "ready", title: metadata.title, artist: metadata.artist, objectKey, sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), leaseToken: null, leaseUntil: null,
    } });
    if (!updated.count) { await deletePrivateObject(objectKey); return { outcome: "superseded" }; }
    return { outcome: "ready" };
  } catch {
    // A timeout can occur after the ready write committed. Never remove audio
    // unless we still own the processing lease and have marked that job failed.
    const failed = await db.songGuessImport.updateMany({ where: { id: job.id, status: "processing", leaseToken }, data: { status: "failed", error: "음원을 가져오지 못했어요. 공개된 영상인지, 해당 시점부터 15초가 남아 있는지 확인해 주세요.", leaseToken: null, leaseUntil: null } }).catch(() => ({ count: 0 }));
    if (uploaded && failed.count) await deletePrivateObject(objectKey).catch(() => undefined);
    return { outcome: "failed" };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
