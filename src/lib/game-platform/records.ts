import { Prisma, type GameResult } from "@prisma/client";
import type {
  GameRecordDto,
  GameRecordRange,
  OfficialGameKind,
} from "./contracts";
import { isOfficialGameKind, parseGameOutcome } from "./contracts";
import { parseGameMetrics } from "./metrics";

export type GameRecordCursor = {
  completedAt: string;
  id: string;
};

export function rangeStart(
  range: GameRecordRange,
  now = new Date(),
): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function encodeGameRecordCursor(cursor: GameRecordCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeGameRecordCursor(value: string): GameRecordCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<GameRecordCursor>;
    if (
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      typeof parsed.completedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.completedAt))
    ) {
      return null;
    }
    return { id: parsed.id, completedAt: parsed.completedAt };
  } catch {
    return null;
  }
}

export function gameRecordWhere(input: {
  studentId: string;
  kind?: OfficialGameKind;
  range: GameRecordRange;
  cursor?: GameRecordCursor | null;
  now?: Date;
}): Prisma.GameResultWhereInput {
  const cutoff = rangeStart(input.range, input.now);
  const cursorDate = input.cursor
    ? new Date(input.cursor.completedAt)
    : null;
  return {
    studentId: input.studentId,
    ...(input.kind ? { gameKind: input.kind } : {}),
    ...(cutoff ? { completedAt: { gte: cutoff } } : {}),
    ...(cursorDate && input.cursor
      ? {
          AND: [
            {
              OR: [
                { completedAt: { lt: cursorDate } },
                {
                  completedAt: cursorDate,
                  id: { lt: input.cursor.id },
                },
              ],
            },
          ],
        }
      : {}),
  };
}

function safeBigIntNumber(value: bigint | null): number | null {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new RangeError("game_result_integer_out_of_range");
  }
  return number;
}

export function serializeGameRecord(
  row: GameResult & { board: { title: string } },
): GameRecordDto {
  if (!isOfficialGameKind(row.gameKind)) {
    throw new TypeError("unknown_game_kind");
  }
  const outcome = parseGameOutcome(row.outcome);
  if (!outcome) throw new TypeError("unknown_game_outcome");
  return {
    id: row.id,
    gameKind: row.gameKind,
    boardId: row.boardId,
    boardTitle: row.board.title,
    outcome,
    score: safeBigIntNumber(row.score),
    durationMs: safeBigIntNumber(row.durationMs),
    metrics: parseGameMetrics(row.gameKind, row.metrics),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  } as GameRecordDto;
}

export function nextGameRecordCursor(
  rows: Array<{ id: string; completedAt: Date }>,
): string | null {
  const last = rows.at(-1);
  return last
    ? encodeGameRecordCursor({
        id: last.id,
        completedAt: last.completedAt.toISOString(),
      })
    : null;
}
