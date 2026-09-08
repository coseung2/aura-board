export const SONG_GUESS_COMMAND_SCHEMA_VERSION = 1 as const;
export const SONG_GUESS_RULES_VERSION = 2 as const;
export const SONG_GUESS_STATE_SCHEMA_VERSION = 2 as const;
export const SONG_GUESS_LEGACY_CLIP_TIERS_MS = [500, 1000, 1500] as const;
export const SONG_GUESS_HIGHLIGHT_MS = 15_000 as const;
export const SONG_GUESS_ROUND_TIME_LIMIT_MS = 30_000 as const;
export const SONG_GUESS_MAX_SCORE = 1_000 as const;
export const SONG_GUESS_MIN_SCORE = 100 as const;
export const SONG_GUESS_CLIP_TIERS_MS = [
  500,
  1000,
  1500,
  SONG_GUESS_HIGHLIGHT_MS,
] as const;

export type SongGuessPhase =
  | "draft"
  | "lobby"
  | "guessing"
  | "reveal"
  | "finished";
export type SongGuessClipTierMs = (typeof SONG_GUESS_CLIP_TIERS_MS)[number];
export type SongGuessMimeType =
  | "audio/wav"
  | "audio/mp4"
  | "audio/webm"
  | "audio/ogg"
  | "video/youtube";

export type SongGuessRepresentativePet = {
  color: string;
  growthStage: 1 | 2 | 3;
  equippedItemKeys: string[];
  hiddenItemKeys: string[];
  equippedTitleKey: string | null;
};

export type SongGuessSnapshot = {
  sessionId: string;
  boardId: string;
  gameKind: "song-guess";
  version: number;
  serverTimeMs: number;
  rulesVersion: 1 | typeof SONG_GUESS_RULES_VERSION;
  stateSchemaVersion: 1 | typeof SONG_GUESS_STATE_SCHEMA_VERSION;
  previousSessionId: string | null;
  phase: SongGuessPhase;
  currentRound: {
    roundId: string;
    order: number;
    accessibilityClue: string | null;
    revealedAnswer: string | null;
    /** Timing fields were added in v2; v1 snapshots omit them. */
    startedAtMs?: number | null;
    deadlineAtMs?: number | null;
    maxScore?: number;
    currentClip: {
      assetId: string;
      tierMs: SongGuessClipTierMs;
      mimeType: SongGuessMimeType;
      durationMs: number;
      sizeBytes: number;
    } | null;
  };
  participants: Array<{
    displayName: string;
    score: number;
    scoredCurrentRound: boolean;
    /** Optional for compatibility with snapshots from before lobby join. */
    joined?: boolean;
    roundScore?: number;
    previousRank?: number;
    participantId?: string;
    representativePet?: SongGuessRepresentativePet | null;
  }>;
  viewer: {
    role: "host" | "participant";
    scoredCurrentRound: boolean;
    joined?: boolean;
    participantIndex?: number;
  };
};

export type SongGuessIntent =
  | { type: "guess"; text: string; roundId?: string }
  | { type: "join" };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isMimeType(value: unknown): value is SongGuessMimeType {
  return [
    "audio/wav",
    "audio/mp4",
    "audio/webm",
    "audio/ogg",
    "video/youtube",
  ].includes(String(value));
}

export function isSongGuessSnapshot(
  value: unknown,
): value is SongGuessSnapshot {
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
  const hasForbiddenKey = (candidate: unknown) =>
    isRecord(candidate) && forbiddenKeys.some((key) => key in candidate);
  const currentRound = value.currentRound;
  const viewer = value.viewer;
  const participants = value.participants;
  if (
    forbiddenKeys.some((key) => key in value) ||
    value.gameKind !== "song-guess" ||
    typeof value.sessionId !== "string" ||
    !value.sessionId ||
    typeof value.boardId !== "string" ||
    !value.boardId ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 0 ||
    !Number.isSafeInteger(value.serverTimeMs) ||
    ![1, SONG_GUESS_RULES_VERSION].includes(Number(value.rulesVersion)) ||
    value.stateSchemaVersion !== value.rulesVersion ||
    !(
      value.previousSessionId === null ||
      typeof value.previousSessionId === "string"
    ) ||
    !["draft", "lobby", "guessing", "reveal", "finished"].includes(
      String(value.phase),
    ) ||
    !isRecord(currentRound) ||
    !isRecord(viewer) ||
    !Array.isArray(participants) ||
    hasForbiddenKey(currentRound) ||
    hasForbiddenKey(viewer) ||
    participants.some(hasForbiddenKey)
  )
    return false;

  if (
    typeof currentRound.roundId !== "string" ||
    !currentRound.roundId ||
    !Number.isSafeInteger(currentRound.order) ||
    !(
      currentRound.accessibilityClue === null ||
      typeof currentRound.accessibilityClue === "string"
    ) ||
    !(
      currentRound.revealedAnswer === null ||
      typeof currentRound.revealedAnswer === "string"
    ) ||
    !(
      currentRound.currentClip === null || isRecord(currentRound.currentClip)
    ) ||
    (viewer.role !== "host" && viewer.role !== "participant") ||
    typeof viewer.scoredCurrentRound !== "boolean" ||
    ("joined" in viewer && typeof viewer.joined !== "boolean") ||
    ("participantIndex" in viewer &&
      (!Number.isSafeInteger(viewer.participantIndex) ||
        Number(viewer.participantIndex) < 0))
  )
    return false;

  if (value.phase !== "guessing" && currentRound.currentClip !== null)
    return false;
  if (
    (value.phase === "draft" ||
      value.phase === "lobby" ||
      value.phase === "guessing") &&
    currentRound.revealedAnswer !== null
  )
    return false;
  if (
    (value.phase === "reveal" || value.phase === "finished") &&
    (typeof currentRound.revealedAnswer !== "string" ||
      !currentRound.revealedAnswer.trim())
  )
    return false;
  if (
    (value.phase === "draft" || value.phase === "lobby") &&
    currentRound.accessibilityClue !== null
  )
    return false;

  if (currentRound.currentClip !== null) {
    const clip = currentRound.currentClip;
    if (
      hasForbiddenKey(clip) ||
      typeof clip.assetId !== "string" ||
      !clip.assetId ||
      !SONG_GUESS_CLIP_TIERS_MS.includes(clip.tierMs as SongGuessClipTierMs) ||
      !isMimeType(clip.mimeType) ||
      !Number.isSafeInteger(clip.durationMs) ||
      !Number.isSafeInteger(clip.sizeBytes)
    )
      return false;
    if (
      clip.mimeType === "video/youtube" &&
      (clip.tierMs !== SONG_GUESS_HIGHLIGHT_MS ||
        clip.durationMs !== SONG_GUESS_HIGHLIGHT_MS ||
        clip.sizeBytes !== 0)
    )
      return false;
  }

  // v1 snapshots predate the timing fields and remain valid for older games.
  // v2 snapshots must carry a server-authored 30-second scoring window. The
  // client only uses these fields for display; the server remains authoritative
  // for the score and deadline.
  if (value.rulesVersion === SONG_GUESS_RULES_VERSION) {
    const { startedAtMs, deadlineAtMs, maxScore } = currentRound;
    const waiting = value.phase === "draft" || value.phase === "lobby";
    if (maxScore !== SONG_GUESS_MAX_SCORE) return false;
    if (waiting) {
      if (startedAtMs !== null || deadlineAtMs !== null) return false;
    } else if (
      !Number.isSafeInteger(startedAtMs) ||
      Number(startedAtMs) < 0 ||
      !Number.isSafeInteger(deadlineAtMs) ||
      Number(deadlineAtMs) - Number(startedAtMs) !==
        SONG_GUESS_ROUND_TIME_LIMIT_MS
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
      typeof participant.scoredCurrentRound === "boolean" &&
      !("joined" in participant && typeof participant.joined !== "boolean") &&
      !(
        "roundScore" in participant &&
        (!Number.isSafeInteger(participant.roundScore) ||
          Number(participant.roundScore) < 0)
      ) &&
      !(
        "previousRank" in participant &&
        (!Number.isSafeInteger(participant.previousRank) ||
          Number(participant.previousRank) < 1)
      ) &&
      !(
        "participantId" in participant &&
        (typeof participant.participantId !== "string" ||
          !participant.participantId)
      ) &&
      isRepresentativePet(participant.representativePet),
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
    value.version === value.snapshot.version &&
    (value.result === null || isGuessResult(value.result))
  );
}

function isGuessResult(value: unknown): value is SongGuessGuessResult {
  return (
    isRecord(value) &&
    typeof value.roundId === "string" &&
    SONG_GUESS_CLIP_TIERS_MS.includes(value.tierMs as SongGuessClipTierMs) &&
    typeof value.correct === "boolean" &&
    typeof value.alreadyScored === "boolean" &&
    Number.isSafeInteger(value.score) &&
    Number(value.score) >= 0 &&
    (value.timedOut === undefined || typeof value.timedOut === "boolean")
  );
}

export function mergeSongGuessSnapshot(
  current: SongGuessSnapshot | null,
  sessionId: string,
  candidate: SongGuessSnapshot,
): SongGuessSnapshot | null {
  if (candidate.sessionId !== sessionId) return current;
  if (current?.sessionId !== sessionId) return current ?? candidate;
  return candidate.version >= current.version ? candidate : current;
}

export function makeSongGuessCommand(
  snapshot: SongGuessSnapshot,
  command: SongGuessIntent,
): SongGuessCommandRequest {
  return {
    requestId: `song_guess_${command.type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    expectedVersion: snapshot.version,
    commandSchemaVersion: SONG_GUESS_COMMAND_SCHEMA_VERSION,
    command,
  };
}

function isRepresentativePet(
  value: unknown,
): value is SongGuessRepresentativePet | null | undefined {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value.color === "string" &&
    !!value.color &&
    (value.growthStage === 1 ||
      value.growthStage === 2 ||
      value.growthStage === 3) &&
    isStringArray(value.equippedItemKeys) &&
    isStringArray(value.hiddenItemKeys) &&
    (value.equippedTitleKey === null ||
      typeof value.equippedTitleKey === "string")
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}
