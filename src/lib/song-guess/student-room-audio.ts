import "server-only";
import { db } from "@/lib/db";
import { PlayAccessError, resolveSongGuessActorForSession } from "@/lib/play-platform/actor";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import { downloadPrivateObject } from "@/lib/media-storage";
import { isSongGuessSnapshot } from "./contracts";
import { isSafeSongGuessCatalogObjectKey } from "./catalog";

export async function loadCatalogSessionClip(sessionId: string, assetId: string): Promise<Response> {
  const actor = await resolveSongGuessActorForSession(sessionId);
  const upstream = await playEngineFetch(`/v1/song-guess/sessions/${encodeURIComponent(sessionId)}/snapshot`, { actor });
  const snapshot: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) throw new PlayAccessError(upstream.status, "song_guess_clip_locked");
  if (!isSongGuessSnapshot(snapshot) || snapshot.roomMode !== "student-free" || snapshot.phase !== "guessing" || snapshot.viewer.joined === false || snapshot.currentRound.currentClip?.assetId !== assetId) {
    throw new PlayAccessError(403, "song_guess_clip_locked");
  }
  const clip = await db.songGuessCatalogClip.findUnique({ where: { id: assetId } });
  if (!clip || !isSafeSongGuessCatalogObjectKey(clip.objectKey)) throw new PlayAccessError(404, "song_guess_clip_not_found");
  const object = await downloadPrivateObject(clip.objectKey);
  return new Response(object.body as unknown as BodyInit, { headers: {
    "content-type": clip.mimeType, "content-length": String(clip.sizeBytes),
    "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff",
  } });
}
