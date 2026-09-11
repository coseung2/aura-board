import "server-only";

import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { PlayAccessError, resolveSongGuessActorForBoard } from "@/lib/play-platform/actor";
import { loadSongGuessCatalogFromDb } from "./catalog-db";
import { selectSongGuessCatalogEntries, summarizeSongGuessCatalog, type SongGuessCatalogSelection } from "./catalog";
import { normalizeSongGuessAnswer } from "./contracts";
import { buildSongGuessChoices } from "./choices";

export async function studentRoomCatalog(boardId: string) {
  await resolveSongGuessActorForBoard(boardId);
  // Only category counts cross this boundary, never the selected songs or answers.
  return { categories: summarizeSongGuessCatalog(await loadSongGuessCatalogFromDb()).categories };
}

export async function buildStudentRoomRequest(boardId: string, requestId: string, selection: SongGuessCatalogSelection) {
  const { actor, board } = await resolveSongGuessActorForBoard(boardId);
  if (actor.role !== "participant" || !actor.studentId) throw new PlayAccessError(403, "forbidden");
  const secret = process.env.PLAY_ENGINE_ASSERTION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new PlayAccessError(503, "play_engine_unavailable");
  const seed = createHmac("sha256", secret).update(JSON.stringify(["student-song-room", boardId, actor.subject, requestId])).digest("hex");
  let draw = 0;
  const digest = (label: string) => createHmac("sha256", seed).update(label).digest("hex");
  const classroom = await db.classroom.findUnique({ where: { id: board.classroomId }, select: { teacherId: true } });
  if (!classroom) throw new PlayAccessError(404, "classroom_not_found");
  const students = await db.student.findMany({ where: { classroomId: board.classroomId }, orderBy: { id: "asc" }, take: 100, select: { id: true, name: true } });
  if (!students.some((student) => student.id === actor.studentId)) throw new PlayAccessError(403, "forbidden");
  const catalog = await loadSongGuessCatalogFromDb();
  let selected;
  try { selected = selectSongGuessCatalogEntries(catalog, selection, () => parseInt(digest(`draw:${draw++}`).slice(0, 12), 16) / 0x1000000000000); }
  catch { throw new PlayAccessError(400, "song_guess_catalog_insufficient_songs"); }
  const clips = await db.songGuessCatalogClip.findMany({ where: { songId: { in: selected.map((song) => song.id) }, segment: selection.segment } });
  const rounds = selected.map((song) => {
    const clip = clips.find((candidate) => candidate.songId === song.id);
    if (!clip) throw new PlayAccessError(409, "song_guess_catalog_clip_unavailable");
    return {
      roundId: digest(`round:${song.id}`), representativeAnswer: song.title, normalizedAnswer: normalizeSongGuessAnswer(song.title),
      aliases: song.aliases, normalizedAliases: song.aliases.map(normalizeSongGuessAnswer), accessibilityClue: null,
      clips: [{ assetId: clip.id, tierMs: 15000, mimeType: clip.mimeType, sizeBytes: clip.sizeBytes, durationMs: clip.durationMs }],
    };
  });
  let choices;
  try { choices = buildSongGuessChoices(seed, rounds.map((round) => ({ ...round, id: round.roundId })), catalog); }
  catch { throw new PlayAccessError(400, "insufficient_song_guess_choices"); }
  return {
    requestId, roomMode: "student-free", classroomTeacherSubject: `teacher:${classroom.teacherId}`,
    answerMode: "multiple-choice", answerTarget: "title",
    participants: students.map((student) => ({ actorSubject: `student:${student.id}`, displayName: student.name })),
    rounds: rounds.map((round, index) => ({ ...round, choices: choices[index] })),
  };
}
