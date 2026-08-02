export const SONG_GUESS_COMMAND_SCHEMA_VERSION = 1 as const;
export const SONG_GUESS_RULES_VERSION = 1 as const;
export const SONG_GUESS_STATE_SCHEMA_VERSION = 1 as const;
export const SONG_GUESS_CLIP_TIERS_MS = [500, 1000, 1500] as const;
export const SONG_GUESS_CLIP_SCORES = [1000, 700, 400] as const;
export const SONG_GUESS_MAX_ROUNDS = 50;
export const SONG_GUESS_MAX_CLIP_SIZE_BYTES = 8 * 1024 * 1024;
export const SONG_GUESS_ALLOWED_MIME_TYPES = [
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
] as const;

export type SongGuessPhase = "draft" | "lobby" | "guessing" | "reveal" | "finished";
export type SongGuessClipTierMs = (typeof SONG_GUESS_CLIP_TIERS_MS)[number];
export type SongGuessMimeType = (typeof SONG_GUESS_ALLOWED_MIME_TYPES)[number];
export type SongGuessActorRole = "host" | "participant";

export type SongGuessClipSnapshot = {
  assetId: string;
  tierMs: SongGuessClipTierMs;
  mimeType: SongGuessMimeType;
  durationMs: number;
  sizeBytes: number;
};

export type SongGuessSnapshot = {
  sessionId: string;
  boardId: string;
  gameKind: "song-guess";
  version: number;
  serverTimeMs: number;
  rulesVersion: typeof SONG_GUESS_RULES_VERSION;
  stateSchemaVersion: typeof SONG_GUESS_STATE_SCHEMA_VERSION;
  previousSessionId: string | null;
  phase: SongGuessPhase;
  currentRound: {
    roundId: string;
    order: number;
    accessibilityClue: string | null;
    revealedAnswer: string | null;
    currentClip: SongGuessClipSnapshot | null;
  };
  participants: Array<{
    displayName: string;
    score: number;
    scoredCurrentRound: boolean;
  }>;
  viewer: {
    role: SongGuessActorRole;
    scoredCurrentRound: boolean;
  };
};

export type SongGuessIntent =
  | { type: "open_lobby" }
  | { type: "start" }
  | { type: "unlock_clip" }
  | { type: "guess"; text: string }
  | { type: "reveal" }
  | { type: "next_round" }
  | { type: "finish" };

export type SongGuessCommandRequest = {
  requestId: string;
  expectedVersion: number;
  commandSchemaVersion: typeof SONG_GUESS_COMMAND_SCHEMA_VERSION;
  command: SongGuessIntent;
};

export type SongGuessGuessResult = {
  roundId: string;
  tierMs: SongGuessClipTierMs;
  correct: boolean;
  alreadyScored: boolean;
  score: number;
};

export type SongGuessCommandResponse = {
  requestId: string;
  previousVersion: number;
  version: number;
  snapshot: SongGuessSnapshot;
  result: SongGuessGuessResult | null;
};

export type SongGuessApiError = {
  error: string;
  detail?: string;
  currentVersion?: number;
  snapshot?: SongGuessSnapshot;
};

export type SongGuessClipMetadata = {
  tierMs: number;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
};

export type SongGuessRoundSetupInput = {
  representativeAnswer: string;
  aliases?: string[];
  accessibilityClue?: string | null;
  clipAssetIds: [string, string, string];
};

export type SongGuessSetupInput = {
  rounds: SongGuessRoundSetupInput[];
};

export type SongGuessTeacherClip = {
  id: string;
  tierMs: SongGuessClipTierMs;
  mimeType: SongGuessMimeType;
  sizeBytes: number;
  durationMs: number;
};

export type SongGuessTeacherSetup = {
  id: string;
  boardId: string;
  rounds: Array<{
    id: string;
    order: number;
    representativeAnswer: string;
    aliases: string[];
    accessibilityClue: string | null;
    clips: SongGuessTeacherClip[];
  }>;
};

export type UploadedSongGuessClip = SongGuessTeacherClip;

export type SongGuessSessionResponse = {
  requestId: string;
  snapshot: SongGuessSnapshot;
};

export type NormalizedSongGuessRound = {
  order: number;
  representativeAnswer: string;
  normalizedAnswer: string;
  aliases: string[];
  normalizedAliases: string[];
  accessibilityClue: string | null;
  clipAssetIds: [string, string, string];
};

export type NormalizedSongGuessSetup = {
  rounds: NormalizedSongGuessRound[];
};

export function normalizeSongGuessAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .toLocaleLowerCase("und")
    .trim()
    .replace(/\s+/gu, " ");
}

export function scoreForSongGuessTier(tierMs: number): number | null {
  const index = SONG_GUESS_CLIP_TIERS_MS.indexOf(tierMs as SongGuessClipTierMs);
  return index < 0 ? null : SONG_GUESS_CLIP_SCORES[index];
}

export function isSongGuessMimeType(value: string): value is SongGuessMimeType {
  return (SONG_GUESS_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function validateSongGuessClipMetadata(
  metadata: SongGuessClipMetadata,
): string | null {
  if (!Number.isSafeInteger(metadata.tierMs) || scoreForSongGuessTier(metadata.tierMs) === null) {
    return "invalid_clip_tier";
  }
  if (!isSongGuessMimeType(metadata.mimeType)) return "invalid_clip_mime_type";
  if (
    !Number.isSafeInteger(metadata.sizeBytes) ||
    metadata.sizeBytes <= 0 ||
    metadata.sizeBytes > SONG_GUESS_MAX_CLIP_SIZE_BYTES
  ) {
    return "invalid_clip_size";
  }
  const tolerance = metadata.tierMs === 500 ? 50 : metadata.tierMs === 1000 ? 50 : 50;
  if (
    !Number.isSafeInteger(metadata.durationMs) ||
    metadata.durationMs < metadata.tierMs - tolerance ||
    metadata.durationMs > metadata.tierMs + tolerance
  ) {
    return "invalid_clip_duration";
  }
  return null;
}

/** Validate the exact deterministic PCM WAV shape produced by the teacher UI. */
export function validateSongGuessWavBytes(
  bytes: Uint8Array,
  tierMs: SongGuessClipTierMs,
): string | null {
  if (bytes.byteLength < 44) return "invalid_wav_clip";
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (
    ascii(0, 4) !== "RIFF" ||
    ascii(8, 4) !== "WAVE" ||
    ascii(12, 4) !== "fmt " ||
    ascii(36, 4) !== "data"
  ) return "invalid_wav_clip";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataLength = view.getUint32(40, true);
  const expectedFrames = Math.round((44_100 * tierMs) / 1_000);
  const expectedDataLength = expectedFrames * 2;
  if (
    view.getUint32(4, true) !== bytes.byteLength - 8 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 44_100 ||
    view.getUint32(28, true) !== 88_200 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    dataLength !== expectedDataLength ||
    bytes.byteLength !== 44 + dataLength
  ) return "invalid_wav_clip";
  return null;
}

export function normalizeSongGuessSetup(
  input: SongGuessSetupInput,
): NormalizedSongGuessSetup {
  if (
    !Array.isArray(input.rounds) ||
    input.rounds.length < 1 ||
    input.rounds.length > SONG_GUESS_MAX_ROUNDS
  ) {
    throw new Error("invalid_rounds");
  }

  const usedAssetIds = new Set<string>();
  const rounds = input.rounds.map((round, order) => {
    const representativeAnswer = round.representativeAnswer.trim();
    if (!representativeAnswer || representativeAnswer.length > 200) {
      throw new Error("invalid_representative_answer");
    }
    const normalizedAnswer = normalizeSongGuessAnswer(representativeAnswer);
    if (!normalizedAnswer) throw new Error("invalid_representative_answer");

    const aliases = [...(round.aliases ?? [])].map((alias) => alias.trim());
    if (aliases.length > 20 || aliases.some((alias) => !alias || alias.length > 200)) {
      throw new Error("invalid_aliases");
    }
    const normalizedAliases = aliases.map(normalizeSongGuessAnswer);
    if (
      new Set(normalizedAliases).size !== normalizedAliases.length ||
      normalizedAliases.some((alias) => !alias)
    ) {
      throw new Error("invalid_aliases");
    }
    const accessibilityClue = round.accessibilityClue?.trim() || null;
    if (accessibilityClue && accessibilityClue.length > 500) {
      throw new Error("invalid_accessibility_clue");
    }
    if (
      !Array.isArray(round.clipAssetIds) ||
      round.clipAssetIds.length !== 3 ||
      round.clipAssetIds.some((id) => !/^[A-Za-z0-9._-]{1,255}$/.test(id)) ||
      new Set(round.clipAssetIds).size !== 3 ||
      round.clipAssetIds.some((id) => usedAssetIds.has(id))
    ) {
      throw new Error("invalid_clip_assets");
    }
    for (const id of round.clipAssetIds) usedAssetIds.add(id);
    return {
      order,
      representativeAnswer,
      normalizedAnswer,
      aliases,
      normalizedAliases,
      accessibilityClue,
      clipAssetIds: round.clipAssetIds,
    };
  });
  return { rounds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function isSongGuessSnapshot(value: unknown): value is SongGuessSnapshot {
  if (!isRecord(value)) return false;
  const forbiddenKeys = [
    "answer",
    "representativeAnswer",
    "normalizedAnswer",
    "aliases",
    "normalizedAliases",
    "original",
    "source",
    "sourceUrl",
    "objectKey",
    "futureClips",
    "clips",
  ];
  if (forbiddenKeys.some((key) => key in value)) return false;
  const currentRound = value.currentRound;
  const viewer = value.viewer;
  const participants = value.participants;
  const hasForbiddenKey = (candidate: unknown) =>
    isRecord(candidate) && forbiddenKeys.some((key) => key in candidate);
  if (
    value.gameKind !== "song-guess" ||
    typeof value.sessionId !== "string" ||
    !value.sessionId ||
    typeof value.boardId !== "string" ||
    !value.boardId ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 0 ||
    !Number.isSafeInteger(value.serverTimeMs) ||
    value.rulesVersion !== SONG_GUESS_RULES_VERSION ||
    value.stateSchemaVersion !== SONG_GUESS_STATE_SCHEMA_VERSION ||
    !(value.previousSessionId === null || typeof value.previousSessionId === "string") ||
    !["draft", "lobby", "guessing", "reveal", "finished"].includes(String(value.phase)) ||
    !isRecord(currentRound) ||
    !isRecord(viewer) ||
    !Array.isArray(participants) ||
    hasForbiddenKey(currentRound) ||
    hasForbiddenKey(viewer) ||
    participants.some(hasForbiddenKey)
  ) {
    return false;
  }
  if (
    typeof currentRound.roundId !== "string" ||
    !currentRound.roundId ||
    !Number.isSafeInteger(currentRound.order) ||
    !(currentRound.accessibilityClue === null || typeof currentRound.accessibilityClue === "string") ||
    !(currentRound.revealedAnswer === null || typeof currentRound.revealedAnswer === "string") ||
    !(currentRound.currentClip === null || isRecord(currentRound.currentClip)) ||
    (viewer.role !== "host" && viewer.role !== "participant") ||
    typeof viewer.scoredCurrentRound !== "boolean"
  ) {
    return false;
  }
  if (currentRound.currentClip !== null && hasForbiddenKey(currentRound.currentClip)) {
    return false;
  }
  if (value.phase !== "guessing" && currentRound.currentClip !== null) return false;
  if (
    (value.phase === "draft" || value.phase === "lobby" || value.phase === "guessing") &&
    currentRound.revealedAnswer !== null
  ) return false;
  if (
    (value.phase === "reveal" || value.phase === "finished") &&
    (typeof currentRound.revealedAnswer !== "string" || !currentRound.revealedAnswer.trim())
  ) return false;
  if (
    (value.phase === "draft" || value.phase === "lobby") &&
    currentRound.accessibilityClue !== null
  ) return false;
  if (currentRound.currentClip !== null) {
    const clip = currentRound.currentClip;
    if (
      typeof clip.assetId !== "string" ||
      !clip.assetId ||
      !SONG_GUESS_CLIP_TIERS_MS.includes(clip.tierMs as SongGuessClipTierMs) ||
      !isSongGuessMimeType(String(clip.mimeType)) ||
      !Number.isSafeInteger(clip.durationMs) ||
      !Number.isSafeInteger(clip.sizeBytes)
    ) {
      return false;
    }
  }
  return participants.every(
    (participant) =>
      isRecord(participant) &&
      typeof participant.displayName === "string" &&
      !!participant.displayName &&
      Number.isSafeInteger(participant.score) &&
      Number(participant.score) >= 0 &&
      typeof participant.scoredCurrentRound === "boolean",
  );
}

export function isSongGuessCommandResponse(
  value: unknown,
): value is SongGuessCommandResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.requestId === "string" &&
    Number.isSafeInteger(value.previousVersion) &&
    Number.isSafeInteger(value.version) &&
    isSongGuessSnapshot(value.snapshot) &&
    value.version === value.snapshot.version
  );
}

/** A delayed command response or invalidation must never roll a recovered game back. */
export function mergeSongGuessSnapshot(
  current: SongGuessSnapshot | null,
  sessionId: string,
  candidate: SongGuessSnapshot,
): SongGuessSnapshot | null {
  if (candidate.sessionId !== sessionId) return current;
  if (current?.sessionId !== sessionId) return current ?? candidate;
  return candidate.version >= current.version ? candidate : current;
}
