export const GAME_PLATFORM_SCHEMA_VERSION = 1 as const;

export const MOBILE_OFFICIAL_GAME_KINDS = [
  "kordle",
  "speed-game",
  "shadow-alliance",
  "omok",
  "song-guess",
] as const;

export type MobileOfficialGameKind =
  (typeof MOBILE_OFFICIAL_GAME_KINDS)[number];

export const MOBILE_GAME_HUB_ORDER = [
  "shadow-alliance",
  "kordle",
  "speed-game",
  "omok",
  "song-guess",
] as const satisfies readonly MobileOfficialGameKind[];

export const MOBILE_GAME_OUTCOMES = [
  "win",
  "loss",
  "draw",
  "completed",
  "forfeit",
  "abandoned",
  "host-ended",
] as const;
export type MobileGameOutcome = (typeof MOBILE_GAME_OUTCOMES)[number];

export const MOBILE_GAME_RECORD_RANGES = ["7d", "30d", "90d", "all"] as const;
export type MobileGameRecordRange = (typeof MOBILE_GAME_RECORD_RANGES)[number];

export const MOBILE_GAME_CATALOG = {
  kordle: {
    wireValue: "kordle",
    displayName: "꼬들",
    description: "글자 단서를 따라 오늘의 단어를 추리해요.",
    artworkKey: "kordle",
    availability: "always-open",
    statusLabel: "상시 입장",
    routeSegment: "kordle",
  },
  "speed-game": {
    wireValue: "speed-game",
    displayName: "스피드게임",
    description: "제시어를 설명하고 모둠 친구와 빠르게 맞혀요.",
    artworkKey: "speed-game",
    availability: "always-open",
    statusLabel: "상시 입장",
    routeSegment: "speed-game",
  },
  "shadow-alliance": {
    wireValue: "shadow-alliance",
    displayName: "그림자연합",
    description: "숫자를 숨겨 고르고 팀의 평균으로 승부해요.",
    artworkKey: "shadow-alliance",
    availability: "always-open",
    statusLabel: "상시 입장",
    routeSegment: "shadow-alliance",
  },
  omok: {
    wireValue: "omok",
    displayName: "오목",
    description: "흑과 백으로 번갈아 두며 다섯 돌을 먼저 이어요.",
    artworkKey: "omok",
    availability: "always-open",
    statusLabel: "상시 입장",
    routeSegment: "omok",
  },
  "song-guess": {
    wireValue: "song-guess",
    displayName: "노래 맞히기",
    description: "짧은 음원을 듣고 곡 제목을 가장 먼저 맞혀요.",
    artworkKey: "song-guess",
    availability: "always-open",
    statusLabel: "상시 입장",
    routeSegment: "song-guess",
  },
} as const satisfies Record<
  MobileOfficialGameKind,
  {
    wireValue: MobileOfficialGameKind;
    displayName: string;
    description: string;
    artworkKey: MobileOfficialGameKind;
    availability: "always-open";
    statusLabel: string;
    routeSegment: string;
  }
>;

export function isMobileOfficialGameKind(
  value: unknown,
): value is MobileOfficialGameKind {
  return (
    typeof value === "string" &&
    (MOBILE_OFFICIAL_GAME_KINDS as readonly string[]).includes(value)
  );
}

export function deriveMobileBoardCategory(layout: unknown): "LESSON" | "PLAY" {
  return isMobileOfficialGameKind(layout) ? "PLAY" : "LESSON";
}
