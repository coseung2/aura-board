import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { PlayAccessError, loadSongGuessTeacherBoard } from "@/lib/play-platform/actor";
import { deletePrivateObject, downloadPrivateObject } from "@/lib/media-storage";
import { parseSongGuessImportLink } from "./import-link";
import { storeSongGuessClip } from "./server";
import { validateSongGuessWavBytes } from "./contracts";

const projection = { id: true, sourceUrl: true, startSeconds: true, status: true, title: true, artist: true, error: true } as const;

export async function listSongGuessImports(boardId: string) {
  await loadSongGuessTeacherBoard(boardId);
  return db.songGuessImport.findMany({ where: { boardId }, select: projection, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function enqueueSongGuessImport(boardId: string, link: string) {
  const { actor } = await loadSongGuessTeacherBoard(boardId);
  if (!actor.userId) throw new PlayAccessError(403, "forbidden");
  let source;
  try { source = parseSongGuessImportLink(link); }
  catch { throw new PlayAccessError(400, "invalid_song_guess_import_link"); }
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`song-import:${boardId}`}))`;
    const existing = await tx.songGuessImport.findUnique({ where: { boardId_videoId_startSeconds: { boardId, videoId: source.videoId, startSeconds: source.startSeconds } } });
    if (existing) {
      if (existing.status === "failed" && existing.attempts < 3) {
        const pending = await tx.songGuessImport.count({ where: { boardId, status: { in: ["queued", "processing"] } } });
        if (pending >= 5) throw new PlayAccessError(429, "song_guess_import_limit");
        return tx.songGuessImport.update({ where: { id: existing.id }, data: { status: "queued", error: null, requestedByUserId: actor.userId! }, select: projection });
      }
      return tx.songGuessImport.findUniqueOrThrow({ where: { id: existing.id }, select: projection });
    }
    const [total, pending] = await Promise.all([
      tx.songGuessImport.count({ where: { boardId } }),
      tx.songGuessImport.count({ where: { boardId, status: { in: ["queued", "processing"] } } }),
    ]);
    if (total >= 100 || pending >= 5) throw new PlayAccessError(429, "song_guess_import_limit");
    return tx.songGuessImport.create({ data: { boardId, requestedByUserId: actor.userId!, ...source }, select: projection });
  });
}

export async function editSongGuessImport(boardId: string, id: string, title: string, artist: string) {
  await loadSongGuessTeacherBoard(boardId);
  const updated = await db.songGuessImport.updateMany({ where: { id, boardId, status: "ready" }, data: { title, artist } });
  if (!updated.count) throw new PlayAccessError(404, "song_guess_import_not_ready");
  return db.songGuessImport.findUniqueOrThrow({ where: { id }, select: projection });
}

export async function materializeSongGuessImport(boardId: string, id: string) {
  await loadSongGuessTeacherBoard(boardId);
  const song = await db.songGuessImport.findFirst({ where: { id, boardId, status: "ready" } });
  if (!song?.objectKey || !song.title || !song.artist) throw new PlayAccessError(409, "song_guess_import_metadata_required");
  const { body: bytes } = await downloadPrivateObject(song.objectKey);
  if (bytes.length !== song.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== song.sha256 || validateSongGuessWavBytes(bytes, 15000)) {
    throw new PlayAccessError(409, "song_guess_import_audio_invalid");
  }
  const clip = await storeSongGuessClip(boardId, new File([new Uint8Array(bytes)], `${randomUUID()}.wav`, { type: "audio/wav" }), {
    tierMs: 15000, durationMs: 15000, mimeType: "audio/wav", sizeBytes: bytes.length,
  });
  return { title: song.title, artist: song.artist, clip };
}

export async function deleteSongGuessImport(boardId: string, id: string) {
  await loadSongGuessTeacherBoard(boardId);
  const row = await db.songGuessImport.findFirst({ where: { id, boardId } });
  if (!row) throw new PlayAccessError(404, "song_guess_import_not_found");
  if (row.status === "processing") throw new PlayAccessError(409, "song_guess_import_processing");
  const deleted = await db.songGuessImport.deleteMany({ where: { id, boardId, status: { not: "processing" } } });
  if (!deleted.count) throw new PlayAccessError(409, "song_guess_import_processing");
  if (row.objectKey) await deletePrivateObject(row.objectKey);
}
