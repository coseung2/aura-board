import {
  OFFICIAL_GAME_KINDS,
  type OfficialGameKind,
} from "./contracts";

export const OFFICIAL_PLAY_LAYOUTS = OFFICIAL_GAME_KINDS;
export type OfficialPlayLayout = OfficialGameKind;
export type DerivedBoardCategory = "LESSON" | "PLAY";

export const GAME_HUB_ORDER = [
  "shadow-alliance",
  "kordle",
  "speed-game",
  "omok",
  "song-guess",
] as const satisfies readonly OfficialGameKind[];

export type OfficialGameCatalogEntry = {
  kind: OfficialGameKind;
  label: string;
  description: string;
  artworkKey: OfficialGameKind;
  availability: "always-open";
  statusLabel: string;
  accent: "green" | "amber" | "violet" | "slate" | "sky";
  routeSegment: string;
  /** Legacy board-list fallback only. The game hub always uses raster artwork. */
  emoji: string;
};

export const OFFICIAL_GAME_CATALOG: Record<
  OfficialGameKind,
  OfficialGameCatalogEntry
> = {
  kordle: {
    kind: "kordle",
    label: "꼬들",
    description: "글자 단서를 따라 오늘의 단어를 추리해요.",
    artworkKey: "kordle",
    availability: "always-open",
    statusLabel: "상시 입장",
    emoji: "🟩",
    accent: "green",
    routeSegment: "kordle",
  },
  "speed-game": {
    kind: "speed-game",
    label: "스피드게임",
    description: "제시어를 설명하고 모둠 친구와 빠르게 맞혀요.",
    artworkKey: "speed-game",
    availability: "always-open",
    statusLabel: "상시 입장",
    emoji: "⚡",
    accent: "amber",
    routeSegment: "speed-game",
  },
  "shadow-alliance": {
    kind: "shadow-alliance",
    label: "그림자연합",
    description: "숫자를 숨겨 고르고 팀의 평균으로 승부해요.",
    artworkKey: "shadow-alliance",
    availability: "always-open",
    statusLabel: "상시 입장",
    emoji: "♟",
    accent: "violet",
    routeSegment: "shadow-alliance",
  },
  omok: {
    kind: "omok",
    label: "오목",
    description: "흑과 백으로 번갈아 두며 다섯 돌을 먼저 이어요.",
    artworkKey: "omok",
    availability: "always-open",
    statusLabel: "상시 입장",
    emoji: "⚫",
    accent: "slate",
    routeSegment: "omok",
  },
  "song-guess": {
    kind: "song-guess",
    label: "노래 맞히기",
    description: "짧은 음원을 듣고 곡 제목을 가장 먼저 맞혀요.",
    artworkKey: "song-guess",
    availability: "always-open",
    statusLabel: "상시 입장",
    emoji: "🎧",
    accent: "sky",
    routeSegment: "song-guess",
  },
};

export function isOfficialPlayLayout(
  layout: unknown,
): layout is OfficialPlayLayout {
  return (
    typeof layout === "string" &&
    (OFFICIAL_PLAY_LAYOUTS as readonly string[]).includes(layout)
  );
}

export function deriveBoardCategory(layout: unknown): DerivedBoardCategory {
  return isOfficialPlayLayout(layout) ? "PLAY" : "LESSON";
}

export function gameCatalogEntry(
  layout: unknown,
): OfficialGameCatalogEntry | null {
  return isOfficialPlayLayout(layout) ? OFFICIAL_GAME_CATALOG[layout] : null;
}

export function gameBoardRoute(boardSlugOrId: string, kind: OfficialGameKind) {
  return `/board/${encodeURIComponent(boardSlugOrId)}/play/${OFFICIAL_GAME_CATALOG[kind].routeSegment}`;
}
