import { z } from "zod";
import type {
  GameMetricsByKind,
  OfficialGameKind,
} from "./contracts";

const safeInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const boundedCount = z.number().int().min(0).max(10_000);
const rank = z.number().int().min(1).max(1_000);

export const GAME_METRICS_SCHEMAS = {
  kordle: z
    .object({
      guessesUsed: z.number().int().min(0).max(100),
      maxGuesses: z.number().int().min(1).max(100),
      wordLength: z.number().int().min(1).max(64),
      solved: z.boolean(),
      reason: z.enum([
        "solved",
        "guesses_exhausted",
        "participant_abandon",
        "host_ended",
        "deadline",
      ]),
    })
    .strict(),
  "speed-game": z
    .object({
      attribution: z.literal("team"),
      groupName: z.string().trim().min(1).max(100),
      groupRank: rank,
      correctCount: boundedCount,
      totalRounds: boundedCount,
    })
    .strict(),
  "shadow-alliance": z
    .object({
      rank,
      team: z.enum(["black", "white"]),
      roundWins: boundedCount,
      completedRounds: boundedCount,
      totalRounds: boundedCount,
      reason: z.enum(["completed", "participant_forfeit", "host_ended"]),
    })
    .strict(),
  omok: z
    .object({
      side: z.enum(["black", "white"]),
      moveCount: z.number().int().min(0).max(1_000),
      reason: z.enum(["five", "draw", "resignation", "host_ended"]),
    })
    .strict(),
  "song-guess": z
    .object({
      rank,
      correctRounds: boundedCount,
      totalRounds: boundedCount,
      bestTierMs: safeInt.nullable(),
      reason: z.enum(["completed", "participant_forfeit", "host_ended"]),
    })
    .strict(),
} as const satisfies Record<OfficialGameKind, z.ZodType>;

export function parseGameMetrics<K extends OfficialGameKind>(
  gameKind: K,
  value: unknown,
): GameMetricsByKind[K] {
  const parsed = GAME_METRICS_SCHEMAS[gameKind].parse(value) as GameMetricsByKind[K];
  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > 4_096) {
    throw new z.ZodError([
      {
        code: "custom",
        path: [],
        message: "metrics_json_too_large",
      },
    ]);
  }
  return parsed;
}

export function safeParseGameMetrics<K extends OfficialGameKind>(
  gameKind: K,
  value: unknown,
):
  | { success: true; data: GameMetricsByKind[K] }
  | { success: false; error: z.ZodError } {
  const result = GAME_METRICS_SCHEMAS[gameKind].safeParse(value);
  return result.success
    ? { success: true, data: result.data as GameMetricsByKind[K] }
    : { success: false, error: result.error };
}

export function formatGameMetrics(
  gameKind: OfficialGameKind,
  metrics: GameMetricsByKind[OfficialGameKind],
): string[] {
  switch (gameKind) {
    case "kordle": {
      const value = metrics as GameMetricsByKind["kordle"];
      return [
        value.solved ? `${value.guessesUsed}번 만에 성공` : "정답을 찾지 못함",
        `${value.wordLength}글자 · 최대 ${value.maxGuesses}회`,
      ];
    }
    case "speed-game": {
      const value = metrics as GameMetricsByKind["speed-game"];
      return [
        `${value.groupName} · ${value.groupRank}위`,
        `${value.correctCount}/${value.totalRounds} 정답`,
      ];
    }
    case "shadow-alliance": {
      const value = metrics as GameMetricsByKind["shadow-alliance"];
      return [
        `${value.team} · ${value.rank}위`,
        `${value.roundWins}승 · ${value.completedRounds}/${value.totalRounds} 라운드`,
      ];
    }
    case "omok": {
      const value = metrics as GameMetricsByKind["omok"];
      return [
        value.side === "black" ? "흑돌" : "백돌",
        `${value.moveCount}수 · ${value.reason}`,
      ];
    }
    case "song-guess": {
      const value = metrics as GameMetricsByKind["song-guess"];
      return [
        `${value.rank}위 · ${value.correctRounds}/${value.totalRounds} 정답`,
        value.bestTierMs == null ? "최고 티어 없음" : `${value.bestTierMs}ms 성공`,
      ];
    }
  }
}
