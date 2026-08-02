import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudentRaw } from "@/lib/student-auth";
import {
  isOfficialGameKind,
  parseGameRecordRange,
  type OfficialGameKind,
} from "@/lib/game-platform/contracts";
import {
  decodeGameRecordCursor,
  gameRecordWhere,
  nextGameRecordCursor,
  rangeStart,
  serializeGameRecord,
} from "@/lib/game-platform/records";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ALLOWED_QUERY_KEYS = new Set(["gameKind", "range", "limit", "cursor"]);
const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function parseLimit(value: string | null): number | null {
  if (value == null || value === "") return DEFAULT_LIMIT;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_LIMIT
    ? parsed
    : null;
}

function safeBigInt(value: bigint | null): number | null {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new RangeError("game_result_integer_out_of_range");
  }
  return number;
}

export async function GET(request: Request) {
  const student = await getCurrentStudentRaw();
  if (!student) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return json({ error: "unknown_query", key }, 400);
    }
  }

  const gameKindParam = url.searchParams.get("gameKind") ?? "all";
  const rangeParam = url.searchParams.get("range") ?? "30d";
  const cursorParam = url.searchParams.get("cursor");
  const limit = parseLimit(url.searchParams.get("limit"));

  let gameKind: OfficialGameKind | undefined;
  if (gameKindParam !== "all") {
    if (!isOfficialGameKind(gameKindParam)) {
      return json({ error: "invalid_game_kind" }, 400);
    }
    gameKind = gameKindParam;
  }
  const range = parseGameRecordRange(rangeParam);
  if (!range) return json({ error: "invalid_range" }, 400);
  if (limit == null) return json({ error: "invalid_limit" }, 400);

  const cursor = cursorParam ? decodeGameRecordCursor(cursorParam) : null;
  if (cursorParam && !cursor) return json({ error: "invalid_cursor" }, 400);

  const now = new Date();
  const cutoff = rangeStart(range, now);
  const summaryWhere = {
    studentId: student.id,
    ...(gameKind ? { gameKind } : {}),
    ...(cutoff ? { completedAt: { gte: cutoff } } : {}),
  };
  const facetWhere = {
    studentId: student.id,
    ...(cutoff ? { completedAt: { gte: cutoff } } : {}),
  };

  try {
    const [rows, facetRows, outcomeRows, aggregate] = await Promise.all([
      db.gameResult.findMany({
        where: gameRecordWhere({
          studentId: student.id,
          kind: gameKind,
          range,
          cursor,
          now,
        }),
        orderBy: [{ completedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { board: { select: { title: true } } },
      }),
      db.gameResult.groupBy({
        by: ["gameKind"],
        where: facetWhere,
        _count: { _all: true },
        orderBy: { gameKind: "asc" },
      }),
      db.gameResult.groupBy({
        by: ["outcome"],
        where: summaryWhere,
        _count: { _all: true },
        orderBy: { outcome: "asc" },
      }),
      db.gameResult.aggregate({
        where: summaryWhere,
        _count: { _all: true },
        _max: { score: true, completedAt: true },
      }),
    ]);

    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const records = visibleRows.map(serializeGameRecord);
    const outcomeCounts = Object.fromEntries(
      outcomeRows.map((entry) => [entry.outcome, entry._count._all]),
    );

    return json({
      schemaVersion: 1,
      appliedFilter: {
        gameKind: gameKind ?? "all",
        range,
        limit,
      },
      summary: {
        totalPlays: aggregate._count._all,
        completedCount:
          (outcomeCounts.win ?? 0) +
          (outcomeCounts.draw ?? 0) +
          (outcomeCounts.completed ?? 0),
        bestScore: safeBigInt(aggregate._max.score),
        latestCompletedAt: aggregate._max.completedAt?.toISOString() ?? null,
      },
      facets: Object.fromEntries(
        facetRows
          .filter((entry) => isOfficialGameKind(entry.gameKind))
          .map((entry) => [entry.gameKind, entry._count._all]),
      ),
      records,
      nextCursor: hasMore ? nextGameRecordCursor(visibleRows) : null,
    });
  } catch (error) {
    console.error("[GET /api/student/game-records]", error);
    return json({ error: "invalid_record_data" }, 500);
  }
}
