import "server-only";

import { db } from "@/lib/db";
import {
  downloadPrivateObject,
  uploadPrivateObject,
  deletePrivateObject,
} from "@/lib/media-storage";
import {
  loadSongGuessTeacherBoard,
  PlayAccessError,
  resolveSongGuessActorForBoard,
  resolveSongGuessParticipantSeeds,
} from "@/lib/play-platform/actor";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import {
  isSongGuessMimeType,
  isSongGuessSnapshot,
  normalizeSongGuessSetup,
  SONG_GUESS_CLIP_TIERS_MS,
  validateSongGuessClipMetadata,
  validateSongGuessWavBytes,
  type SongGuessClipMetadata,
  type SongGuessClipTierMs,
  type NormalizedSongGuessRound,
  type SongGuessSetupInput,
  type SongGuessTeacherClip,
  type SongGuessTeacherSetup,
  type UploadedSongGuessClip,
} from "./contracts";

export type {
  SongGuessTeacherClip,
  SongGuessTeacherSetup,
  UploadedSongGuessClip,
} from "./contracts";

type StoredSongGuessClip = {
  id: string;
  tierMs: number;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
};

export async function saveSongGuessSetup(
  boardId: string,
  input: SongGuessSetupInput,
): Promise<SongGuessTeacherSetup> {
  const normalized = normalizeSongGuessSetup(input);
  const { actor } = await loadSongGuessTeacherBoard(boardId);
  const uploadedByUserId = actor.userId;
  if (!uploadedByUserId) throw new PlayAccessError(403, "forbidden");
  const requestedAssetIds = normalized.rounds.flatMap((round) => round.clipAssetIds);
  const saved = await db.$transaction(async (tx) => {
    const currentSession = await tx.playSession.findFirst({
      where: { boardId, current: true, gameKind: "song-guess" },
      select: { id: true },
    });
    if (currentSession) throw new PlayAccessError(409, "song_guess_setup_locked");

    const assets = await tx.songGuessAsset.findMany({
      where: { id: { in: requestedAssetIds }, boardId },
      orderBy: { tierMs: "asc" },
    });
    validateSetupAssets(normalized.rounds, assets);
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    const previous = await tx.songGuessGame.findUnique({
      where: { boardId },
      include: { rounds: { include: { clips: true } } },
    });
    const previousAssets = previous?.rounds.flatMap((round) => round.clips) ?? [];
    const previousAssetIds = previousAssets.map((asset) => asset.id);
    const selectedAssetIdSet = new Set(requestedAssetIds);
    const orphanedObjectKeys = previousAssets
      .filter((asset) => !selectedAssetIdSet.has(asset.id))
      .map((asset) => asset.objectKey);

    const game = await tx.songGuessGame.upsert({
      where: { boardId },
      create: { boardId, createdByUserId: uploadedByUserId },
      update: { createdByUserId: uploadedByUserId },
    });
    await tx.songGuessRound.deleteMany({ where: { gameId: game.id } });
    if (previousAssetIds.length > 0) {
      await tx.songGuessAsset.deleteMany({
        where: {
          id: { in: previousAssetIds, notIn: requestedAssetIds },
        },
      });
    }

    const rounds = [] as Array<{
      id: string;
      order: number;
      representativeAnswer: string;
      aliases: string[];
      accessibilityClue: string | null;
      clips: SongGuessTeacherClip[];
    }>;
    for (const round of normalized.rounds) {
      const createdRound = await tx.songGuessRound.create({
        data: {
          gameId: game.id,
          order: round.order,
          representativeAnswer: round.representativeAnswer,
          normalizedAnswer: round.normalizedAnswer,
          aliases: round.aliases,
          normalizedAliases: round.normalizedAliases,
          accessibilityClue: round.accessibilityClue,
        },
      });
      const assigned = await tx.songGuessAsset.updateMany({
        where: { id: { in: round.clipAssetIds }, boardId, roundId: null },
        data: { roundId: createdRound.id },
      });
      if (assigned.count !== round.clipAssetIds.length) {
        throw new PlayAccessError(409, "song_guess_clip_assignment_conflict");
      }
      rounds.push({
        id: createdRound.id,
        order: round.order,
        representativeAnswer: round.representativeAnswer,
        aliases: round.aliases,
        accessibilityClue: round.accessibilityClue,
        clips: round.clipAssetIds.map((id) => {
          const asset = assetsById.get(id);
          if (!asset) throw new PlayAccessError(400, "invalid_clip_assets");
          return serializeTeacherClip(asset);
        }),
      });
    }
    return { id: game.id, boardId, rounds, orphanedObjectKeys };
  });

  await deletePrivateObjects(saved.orphanedObjectKeys);
  return { id: saved.id, boardId: saved.boardId, rounds: saved.rounds };
}

export async function loadSongGuessTeacherSetup(
  boardId: string,
): Promise<SongGuessTeacherSetup | null> {
  await loadSongGuessTeacherBoard(boardId);
  const game = await db.songGuessGame.findUnique({
    where: { boardId },
    include: {
      rounds: {
        orderBy: { order: "asc" },
        include: { clips: { orderBy: { tierMs: "asc" } } },
      },
    },
  });
  return game ? serializeTeacherSetup(game) : null;
}

export async function deleteSongGuessSetup(boardId: string): Promise<boolean> {
  const { actor } = await loadSongGuessTeacherBoard(boardId);
  if (!actor.userId) throw new PlayAccessError(403, "forbidden");
  const deleted = await db.$transaction(async (tx) => {
    const currentSession = await tx.playSession.findFirst({
      where: { boardId, current: true, gameKind: "song-guess" },
      select: { id: true },
    });
    if (currentSession) throw new PlayAccessError(409, "song_guess_setup_locked");
    const game = await tx.songGuessGame.findUnique({
      where: { boardId },
      include: { rounds: { include: { clips: { select: { objectKey: true } } } } },
    });
    if (!game) return { deleted: false, objectKeys: [] as string[] };
    const roundIds = game.rounds.map((round) => round.id);
    const objectKeys = game.rounds.flatMap((round) =>
      round.clips.map((clip) => clip.objectKey),
    );
    if (roundIds.length > 0) {
      await tx.songGuessAsset.deleteMany({ where: { roundId: { in: roundIds } } });
    }
    await tx.songGuessRound.deleteMany({ where: { gameId: game.id } });
    await tx.songGuessGame.delete({ where: { id: game.id } });
    return { deleted: true, objectKeys };
  });
  await deletePrivateObjects(deleted.objectKeys);
  return deleted.deleted;
}

export async function storeSongGuessClip(
  boardId: string,
  file: File,
  metadata: SongGuessClipMetadata,
): Promise<UploadedSongGuessClip> {
  const metadataError = validateSongGuessClipMetadata(metadata);
  if (metadataError) throw new PlayAccessError(400, metadataError);
  if (file.type !== metadata.mimeType || file.size !== metadata.sizeBytes) {
    throw new PlayAccessError(400, "clip_metadata_mismatch");
  }
  const { actor } = await loadSongGuessTeacherBoard(boardId);
  if (!actor.userId) throw new PlayAccessError(403, "forbidden");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(boardId)) {
    throw new PlayAccessError(400, "invalid_board_id");
  }
  const extension = extensionForMime(metadata.mimeType);
  const objectKey = `song-guess/${boardId}/${crypto.randomUUID()}/${metadata.tierMs}.${extension}`;
  const body = Buffer.from(await file.arrayBuffer());
  if (body.byteLength !== metadata.sizeBytes) {
    throw new PlayAccessError(400, "clip_size_mismatch");
  }
  if (
    metadata.mimeType === "audio/wav" &&
    validateSongGuessWavBytes(body, metadata.tierMs as 500 | 1000 | 1500)
  ) {
    throw new PlayAccessError(400, "invalid_wav_clip");
  }
  try {
    await uploadPrivateObject(objectKey, body, { contentType: metadata.mimeType });
    const asset = await db.songGuessAsset.create({
      data: {
        boardId,
        uploadedByUserId: actor.userId,
        tierMs: metadata.tierMs,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        durationMs: metadata.durationMs,
        objectKey,
      },
    });
    return serializeTeacherClip(asset);
  } catch (error) {
    await deletePrivateObject(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteUploadedSongGuessClip(
  boardId: string,
  assetId: string,
): Promise<boolean> {
  const { actor } = await loadSongGuessTeacherBoard(boardId);
  if (!actor.userId) throw new PlayAccessError(403, "forbidden");
  const deleted = await db.$transaction(async (tx) => {
    const asset = await tx.songGuessAsset.findFirst({
      where: { id: assetId, boardId },
      select: { id: true, roundId: true, objectKey: true },
    });
    if (!asset) return null;
    if (asset.roundId) throw new PlayAccessError(409, "song_guess_clip_assigned");
    const result = await tx.songGuessAsset.deleteMany({
      where: { id: asset.id, boardId, roundId: null },
    });
    return result.count === 1 ? asset.objectKey : null;
  });
  if (!deleted) return false;
  await deletePrivateObject(deleted).catch(() => undefined);
  return true;
}

export async function buildSongGuessCreateRequest(
  boardId: string,
  requestId: string,
  studentIds?: readonly string[],
) {
  const { actor } = await loadSongGuessTeacherBoard(boardId);
  if (!actor.userId) throw new PlayAccessError(403, "forbidden");
  const game = await db.songGuessGame.findUnique({
    where: { boardId },
    include: {
      rounds: {
        orderBy: { order: "asc" },
        include: { clips: { orderBy: { tierMs: "asc" } } },
      },
    },
  });
  if (!game) throw new PlayAccessError(404, "song_guess_setup_not_found");
  if (game.rounds.length < 1) throw new PlayAccessError(400, "invalid_rounds");
  validateSetupAssets(
    game.rounds.map((round) => ({
      order: round.order,
      representativeAnswer: round.representativeAnswer,
      normalizedAnswer: round.normalizedAnswer,
      aliases: readStringArray(round.aliases),
      normalizedAliases: readStringArray(round.normalizedAliases),
      accessibilityClue: round.accessibilityClue,
      clipAssetIds: round.clips.map((clip) => clip.id) as [string, string, string],
    })),
    game.rounds.flatMap((round) => round.clips),
  );
  const participants = await resolveSongGuessParticipantSeeds(boardId, studentIds);
  return {
    requestId,
    participants,
    rounds: game.rounds.map((round) => ({
      roundId: round.id,
      representativeAnswer: round.representativeAnswer,
      normalizedAnswer: round.normalizedAnswer,
      aliases: readStringArray(round.aliases),
      normalizedAliases: readStringArray(round.normalizedAliases),
      accessibilityClue: round.accessibilityClue,
      clips: round.clips.map((clip) => ({
          assetId: clip.id,
          tierMs: clip.tierMs,
          mimeType: clip.mimeType,
          sizeBytes: clip.sizeBytes,
          durationMs: clip.durationMs,
        })),
    })),
  };
}

export async function loadSongGuessClipResponse(
  sessionId: string,
  assetId: string,
): Promise<Response> {
  const asset = await db.songGuessAsset.findUnique({
    where: { id: assetId },
    include: { round: { select: { id: true, gameId: true } } },
  });
  if (!asset?.round) throw new PlayAccessError(404, "song_guess_clip_not_found");
  const { actor } = await resolveSongGuessActorForBoard(asset.boardId);
  const upstream = await playEngineFetch(
    `/v1/song-guess/sessions/${encodeURIComponent(sessionId)}/snapshot`,
    { actor },
  );
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const error =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "song_guess_snapshot_failed";
    throw new PlayAccessError(upstream.status, error);
  }
  if (
    !isSongGuessSnapshot(body) ||
    body.boardId !== asset.boardId ||
    body.currentRound.roundId !== asset.round.id
  ) {
    throw new PlayAccessError(404, "song_guess_clip_not_found");
  }
  if (
    actor.role === "participant" &&
    (body.phase !== "guessing" || body.currentRound.currentClip?.assetId !== assetId)
  ) {
    throw new PlayAccessError(403, "song_guess_clip_locked");
  }
  const object = await downloadPrivateObject(asset.objectKey);
  return new Response(object.body as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": asset.mimeType,
      "content-length": String(asset.sizeBytes),
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}

function validateSetupAssets(
  rounds: ReadonlyArray<NormalizedSongGuessRound>,
  assets: ReadonlyArray<StoredSongGuessClip>,
): void {
  const requestedIds = rounds.flatMap((round) => round.clipAssetIds);
  if (rounds.length < 1 || requestedIds.length !== rounds.length * 3) {
    throw new PlayAccessError(400, "three_clips_required");
  }
  const ids = new Set(requestedIds);
  if (ids.size !== requestedIds.length || assets.length !== requestedIds.length) {
    throw new PlayAccessError(400, "invalid_clip_assets");
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const round of rounds) {
    const roundAssets = round.clipAssetIds.map((id) => assetsById.get(id));
    if (roundAssets.some((asset) => !asset)) {
      throw new PlayAccessError(400, "invalid_clip_assets");
    }
    for (const tierMs of SONG_GUESS_CLIP_TIERS_MS) {
      const tierAssets = roundAssets.filter((asset) => asset?.tierMs === tierMs);
      if (tierAssets.length !== 1) throw new PlayAccessError(400, "invalid_clip_tiers");
      const metadataError = validateSongGuessClipMetadata(tierAssets[0]!);
      if (metadataError) throw new PlayAccessError(400, metadataError);
    }
  }
}

function serializeTeacherSetup(game: {
  id: string;
  boardId: string;
  rounds: ReadonlyArray<{
    id: string;
    order: number;
    representativeAnswer: string;
    aliases: unknown;
    accessibilityClue: string | null;
    clips: ReadonlyArray<StoredSongGuessClip>;
  }>;
}): SongGuessTeacherSetup {
  return {
    id: game.id,
    boardId: game.boardId,
    rounds: game.rounds.map((round) => ({
      id: round.id,
      order: round.order,
      representativeAnswer: round.representativeAnswer,
      aliases: readStringArray(round.aliases),
      accessibilityClue: round.accessibilityClue,
      clips: round.clips.map(serializeTeacherClip),
    })),
  };
}

function serializeTeacherClip(clip: StoredSongGuessClip): SongGuessTeacherClip {
  const metadataError = validateSongGuessClipMetadata(clip);
  if (
    metadataError ||
    !SONG_GUESS_CLIP_TIERS_MS.includes(clip.tierMs as SongGuessClipTierMs) ||
    !isSongGuessMimeType(clip.mimeType)
  ) {
    throw new Error(metadataError ?? "invalid_song_guess_clip_state");
  }
  return {
    id: clip.id,
    tierMs: clip.tierMs as SongGuessClipTierMs,
    mimeType: clip.mimeType,
    sizeBytes: clip.sizeBytes,
    durationMs: clip.durationMs,
  };
}

async function deletePrivateObjects(objectKeys: readonly string[]): Promise<void> {
  await Promise.all(
    [...new Set(objectKeys)].map((objectKey) =>
      deletePrivateObject(objectKey).catch(() => undefined),
    ),
  );
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("invalid_song_guess_setup_state");
  }
  return [...value];
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/ogg") return "ogg";
  return "webm";
}
