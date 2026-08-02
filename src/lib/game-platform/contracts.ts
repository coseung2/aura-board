export const GAME_PLATFORM_SCHEMA_VERSION = 1 as const;

export const OFFICIAL_GAME_KINDS = [
  "kordle",
  "speed-game",
  "shadow-alliance",
  "omok",
  "song-guess",
] as const;

export type OfficialGameKind = (typeof OFFICIAL_GAME_KINDS)[number];

export const GAME_OUTCOMES = [
  "win",
  "loss",
  "draw",
  "completed",
  "forfeit",
  "abandoned",
  "host-ended",
] as const;
export type GameOutcome = (typeof GAME_OUTCOMES)[number];

export const GAME_RECORD_RANGES = ["7d", "30d", "90d", "all"] as const;
export type GameRecordRange = (typeof GAME_RECORD_RANGES)[number];

export const GAME_PRESENTATION_PHASES = [
  "loading",
  "empty",
  "unavailable",
  "lobby",
  "ready",
  "active",
  "reconnecting",
  "interrupted",
  "completed",
  "won",
  "lost",
  "draw",
  "forfeit",
  "abandoned",
  "host-ended",
  "error",
] as const;
export type GamePresentationPhase = (typeof GAME_PRESENTATION_PHASES)[number];

export const GAME_CONNECTION_STATES = [
  "online",
  "reconnecting",
  "offline",
] as const;
export type GameConnectionState = (typeof GAME_CONNECTION_STATES)[number];

export const GAME_PRESENTATION_ACTIONS = [
  "join",
  "ready",
  "start",
  "play",
  "exit",
  "end-early",
  "retry",
  "rematch",
  "games",
  "records",
] as const;
export type GamePresentationAction = (typeof GAME_PRESENTATION_ACTIONS)[number];

export type KordleMetrics = {
  guessesUsed: number;
  maxGuesses: number;
  wordLength: number;
  solved: boolean;
  reason:
    | "solved"
    | "guesses_exhausted"
    | "participant_abandon"
    | "host_ended"
    | "deadline";
};

export type SpeedGameMetrics = {
  attribution: "team";
  groupName: string;
  groupRank: number;
  correctCount: number;
  totalRounds: number;
};

export type ShadowAllianceMetrics = {
  rank: number;
  team: "black" | "white";
  roundWins: number;
  completedRounds: number;
  totalRounds: number;
  reason: "completed" | "participant_forfeit" | "host_ended";
};

export type OmokMetrics = {
  side: "black" | "white";
  moveCount: number;
  reason: "five" | "draw" | "resignation" | "host_ended";
};

export type SongGuessMetrics = {
  rank: number;
  correctRounds: number;
  totalRounds: number;
  bestTierMs: number | null;
  reason: "completed" | "participant_forfeit" | "host_ended";
};

export type GameMetricsByKind = {
  kordle: KordleMetrics;
  "speed-game": SpeedGameMetrics;
  "shadow-alliance": ShadowAllianceMetrics;
  omok: OmokMetrics;
  "song-guess": SongGuessMetrics;
};

export type GameRecordDto<K extends OfficialGameKind = OfficialGameKind> = {
  id: string;
  gameKind: K;
  boardId: string;
  boardTitle: string;
  outcome: GameOutcome;
  score: number | null;
  durationMs: number | null;
  metrics: GameMetricsByKind[K];
  startedAt: string;
  completedAt: string;
};

function includes<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isOfficialGameKind(value: unknown): value is OfficialGameKind {
  return includes(OFFICIAL_GAME_KINDS, value);
}

export function isGameOutcome(value: unknown): value is GameOutcome {
  return includes(GAME_OUTCOMES, value);
}

export function isGameRecordRange(value: unknown): value is GameRecordRange {
  return includes(GAME_RECORD_RANGES, value);
}

export function parseOfficialGameKind(value: unknown): OfficialGameKind | null {
  return isOfficialGameKind(value) ? value : null;
}

export function parseGameOutcome(value: unknown): GameOutcome | null {
  return isGameOutcome(value) ? value : null;
}

export function parseGameRecordRange(value: unknown): GameRecordRange | null {
  return isGameRecordRange(value) ? value : null;
}
