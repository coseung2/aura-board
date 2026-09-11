export const SONG_GUESS_COMMAND_SCHEMA_VERSION = 1 as const;
export const SONG_GUESS_RULES_VERSION = 2 as const;
export const SONG_GUESS_STATE_SCHEMA_VERSION = 2 as const;
export const SONG_GUESS_LEGACY_CLIP_TIERS_MS = [500, 1000, 1500] as const;
export const SONG_GUESS_HIGHLIGHT_MS = 15000 as const;
export const SONG_GUESS_CLIP_TIERS_MS = [500, 1000, 1500, 15000] as const;
export const SONG_GUESS_CLIP_SCORES = [1000, 700, 400] as const;
export const SONG_GUESS_MAX_ROUNDS = 50;
export const SONG_GUESS_MAX_CLIP_SIZE_BYTES = 8 * 1024 * 1024;
export const SONG_GUESS_ALLOWED_MIME_TYPES = [
  "audio/wav",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "video/youtube",
] as const;

export type SongGuessPhase = "draft" | "lobby" | "guessing" | "reveal" | "finished";
export type SongGuessClipTierMs = (typeof SONG_GUESS_CLIP_TIERS_MS)[number];
export type SongGuessMimeType = (typeof SONG_GUESS_ALLOWED_MIME_TYPES)[number];
export type SongGuessActorRole = "host" | "participant";
export type SongGuessAnswerMode = "text" | "multiple-choice";
export type SongGuessAnswerTarget = "title" | "artist" | "artist-title";
export const SONG_GUESS_ANSWER_TARGET_LABELS: Record<SongGuessAnswerTarget, string> = {
  title: "노래 제목 맞히기",
  artist: "가수·작곡가 맞히기",
  "artist-title": "가수·작곡가 + 노래 제목 맞히기",
};
export function songGuessAnswerPrompt(target: SongGuessAnswerTarget = "title"): string {
  return target === "artist" ? "가수·작곡가" : target === "artist-title" ? "가수·작곡가 - 노래 제목" : "노래 제목";
}
export type SongGuessChoice = { id: string; label: string };

export type SongGuessClipSnapshot = {
  assetId: string;
  tierMs: SongGuessClipTierMs;
  mimeType: SongGuessMimeType;
  durationMs: number;
  sizeBytes: number;
};

/**
 * Display-only representative pet data attached by the web API layer.
 *
 * The play engine remains the authority for names and scores.  This shape is
 * deliberately optional on snapshots so older sessions and cached payloads
 * remain readable while the API enriches current sessions from the student's
 * classroom-scoped pet inventory.
 */
export type SongGuessRepresentativePet = {
  color: string;
  growthStage: 1 | 2 | 3;
  equippedItemKeys: string[];
  hiddenItemKeys: string[];
  equippedTitleKey: string | null;
};

export type SongGuessSnapshot = {
  roomMode?: "teacher-led" | "student-free";
  hostDisplayName?: string | null;
  nextTransitionAtMs?: number | null;
  sessionId: string;
  boardId: string;
  gameKind: "song-guess";
  version: number;
  serverTimeMs: number;
  rulesVersion: 1 | typeof SONG_GUESS_RULES_VERSION;
  stateSchemaVersion: 1 | typeof SONG_GUESS_STATE_SCHEMA_VERSION;
  previousSessionId: string | null;
  phase: SongGuessPhase;
  answerMode?: SongGuessAnswerMode;
  answerTarget?: SongGuessAnswerTarget;
  currentRound: {
    choices?: SongGuessChoice[];
    roundId: string;
    order: number;
    accessibilityClue: string | null;
    revealedAnswer: string | null;
    currentClip: SongGuessClipSnapshot | null;
    startedAtMs?: number | null;
    deadlineAtMs?: number | null;
    maxScore?: number;
  };
  participants: Array<{
    displayName: string;
    score: number;
    scoredCurrentRound: boolean;
    joined?: boolean;
    roundScore?: number;
    previousRank?: number;
    /** Student identity used to join display-only classroom data. */
    participantId?: string;
    /** Null means the student has not selected a representative pet. */
    representativePet?: SongGuessRepresentativePet | null;
  }>;
  viewer: {
    canStart?: boolean;
    canFinish?: boolean;
    isRoomHost?: boolean;
    answeredCurrentRound?: boolean;
    selectedChoiceId?: string | null;
    role: SongGuessActorRole;
    scoredCurrentRound: boolean;
    joined?: boolean;
    participantIndex?: number;
  };
};

export type SongGuessIntent =
  | { type: "leave" }
  | { type: "open_lobby" }
  | { type: "join" }
  | { type: "start" }
  | { type: "unlock_clip" }
  | { type: "guess"; text?: string; choiceId?: string; roundId?: string }
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
  timedOut?: boolean;
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
  artist?: string | null;
  representativeAnswer: string;
  aliases?: string[];
  accessibilityClue?: string | null;
  clipAssetIds: string[];
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
    artist?: string | null;
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
  artist?: string | null;
  order: number;
  representativeAnswer: string;
  normalizedAnswer: string;
  aliases: string[];
  normalizedAliases: string[];
  accessibilityClue: string | null;
  clipAssetIds: string[];
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
  const index = SONG_GUESS_LEGACY_CLIP_TIERS_MS.indexOf(tierMs as 500 | 1000 | 1500);
  return index < 0 ? null : SONG_GUESS_CLIP_SCORES[index];
}

export function isSongGuessMimeType(value: string): value is SongGuessMimeType {
  return (SONG_GUESS_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function validateSongGuessClipMetadata(
  metadata: SongGuessClipMetadata,
): string | null {
  if (!Number.isSafeInteger(metadata.tierMs) || !SONG_GUESS_CLIP_TIERS_MS.includes(metadata.tierMs as SongGuessClipTierMs)) {
    return "invalid_clip_tier";
  }
  if (!isSongGuessMimeType(metadata.mimeType)) return "invalid_clip_mime_type";
  if (metadata.mimeType === "video/youtube") {
    if (metadata.tierMs !== SONG_GUESS_HIGHLIGHT_MS) return "invalid_clip_tier";
    if (metadata.sizeBytes !== 0) return "invalid_clip_size";
    return metadata.durationMs === SONG_GUESS_HIGHLIGHT_MS ? null : "invalid_clip_duration";
  }
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
    if (round.artist != null && (typeof round.artist !== "string" || round.artist.trim().length > 200)) {
      throw new Error("invalid_song_guess_artist");
    }
    const artist = round.artist?.trim() || null;
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
      ![1, 3].includes(round.clipAssetIds.length) ||
      round.clipAssetIds.some((id) => !/^[A-Za-z0-9._-]{1,255}$/.test(id)) ||
      new Set(round.clipAssetIds).size !== round.clipAssetIds.length ||
      round.clipAssetIds.some((id) => usedAssetIds.has(id))
    ) {
      throw new Error("invalid_clip_assets");
    }
    for (const id of round.clipAssetIds) usedAssetIds.add(id);
    return {
      order,
      representativeAnswer,
      artist,
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
    "videoId",
    "youtubeVideoId",
    "playbackStartMs",
    "objectKey",
    "futureClips",
    "clips",
    "correctChoiceId",
    "selections",
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
    (value.rulesVersion !== 1 && value.rulesVersion !== SONG_GUESS_RULES_VERSION) ||
    value.stateSchemaVersion !== value.rulesVersion ||
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
    typeof viewer.scoredCurrentRound !== "boolean" ||
    (viewer.joined !== undefined && typeof viewer.joined !== "boolean") ||
    (viewer.participantIndex !== undefined &&
      (!Number.isSafeInteger(viewer.participantIndex) || Number(viewer.participantIndex) < 0))
  ) {
    return false;
  }
  if (currentRound.currentClip !== null && hasForbiddenKey(currentRound.currentClip)) {
    return false;
  }
  if (value.answerMode !== undefined && value.answerMode !== "text" && value.answerMode !== "multiple-choice") return false;
  if (value.answerTarget !== undefined && !["title", "artist", "artist-title"].includes(String(value.answerTarget))) return false;
  const choices = currentRound.choices;
  const endedBeforeStart = value.rulesVersion === 2 && value.phase === "finished" && currentRound.startedAtMs === null && currentRound.deadlineAtMs === null;
  if (endedBeforeStart && (currentRound.revealedAnswer !== null || currentRound.accessibilityClue !== null)) return false;
  const showChoices = value.answerMode === "multiple-choice" && value.phase !== "draft" && value.phase !== "lobby" && !endedBeforeStart;
  if (showChoices) {
    if (!Array.isArray(choices) || choices.length !== 4 || choices.some((choice) =>
      !isRecord(choice) || Object.keys(choice).some((key) => key !== "id" && key !== "label") ||
      typeof choice.id !== "string" || !choice.id || typeof choice.label !== "string" || !choice.label.trim()
    )) return false;
    if (new Set(choices.map((choice) => choice.id)).size !== 4 ||
      new Set(choices.map((choice) => normalizeSongGuessAnswer(choice.label))).size !== 4) return false;
  } else if (choices !== undefined) return false;
  if (viewer.answeredCurrentRound !== undefined && typeof viewer.answeredCurrentRound !== "boolean") return false;
  if (viewer.selectedChoiceId != null && (viewer.role !== "participant" ||
    viewer.answeredCurrentRound !== true || !Array.isArray(choices) ||
    !choices.some((choice) => choice.id === viewer.selectedChoiceId))) return false;
  if (participants.some((participant) => isRecord(participant) &&
    ("selectedChoiceId" in participant || "answeredCurrentRound" in participant))) return false;
  if (value.rulesVersion === 2) {
    const { startedAtMs, deadlineAtMs, maxScore } = currentRound;
    const waiting = value.phase === "draft" || value.phase === "lobby" || (value.phase === "finished" && startedAtMs === null && deadlineAtMs === null);
    if (maxScore !== 1000) return false;
    if (waiting) {
      if (startedAtMs !== null || deadlineAtMs !== null) return false;
    } else if (
      !Number.isSafeInteger(startedAtMs) || Number(startedAtMs) < 0 ||
      !Number.isSafeInteger(deadlineAtMs) || Number(deadlineAtMs) - Number(startedAtMs) !== 30000
    ) return false;
  }
  if (value.phase !== "guessing" && currentRound.currentClip !== null) return false;
  if (
    (value.phase === "draft" || value.phase === "lobby" || value.phase === "guessing") &&
    currentRound.revealedAnswer !== null
  ) return false;
  if (
    (value.phase === "reveal" || (value.phase === "finished" && !(value.rulesVersion === 2 && currentRound.startedAtMs === null && currentRound.deadlineAtMs === null))) &&
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
  const isRepresentativePet = (candidate: unknown): candidate is SongGuessRepresentativePet => {
    if (!isRecord(candidate)) return false;
    return (
      typeof candidate.color === "string" &&
      candidate.color.length > 0 &&
      Number.isSafeInteger(candidate.growthStage) &&
      [1, 2, 3].includes(Number(candidate.growthStage)) &&
      Array.isArray(candidate.equippedItemKeys) &&
      candidate.equippedItemKeys.every((key) => typeof key === "string") &&
      Array.isArray(candidate.hiddenItemKeys) &&
      candidate.hiddenItemKeys.every((key) => typeof key === "string") &&
      (candidate.equippedTitleKey === null || typeof candidate.equippedTitleKey === "string")
    );
  };
  return participants.every(
    (participant) =>
      isRecord(participant) &&
      typeof participant.displayName === "string" &&
      !!participant.displayName &&
      Number.isSafeInteger(participant.score) &&
      Number(participant.score) >= 0 &&
      typeof participant.scoredCurrentRound === "boolean" &&
      (participant.joined === undefined || typeof participant.joined === "boolean") &&
      (participant.roundScore === undefined ||
        (Number.isSafeInteger(participant.roundScore) && Number(participant.roundScore) >= 0)) &&
      (participant.previousRank === undefined ||
        (Number.isSafeInteger(participant.previousRank) && Number(participant.previousRank) >= 1)) &&
      (participant.participantId === undefined ||
        (typeof participant.participantId === "string" && !!participant.participantId)) &&
      (participant.representativePet === undefined ||
        participant.representativePet === null ||
        isRepresentativePet(participant.representativePet)),
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
