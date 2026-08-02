import { Prisma, type GameResult } from "@prisma/client";
import type {
  GameMetricsByKind,
  GameOutcome,
  OfficialGameKind,
} from "./contracts";
import { parseGameMetrics } from "./metrics";

export type GameResultSourceType =
  | "play_session"
  | "kordle_attempt"
  | "speed_game_run";

export type WriteGameResultInput<K extends OfficialGameKind> = {
  gameKind: K;
  boardId: string;
  classroomId: string;
  studentId: string;
  sourceType: GameResultSourceType;
  sourceId: string;
  outcome: GameOutcome;
  score?: number | null;
  durationMs?: number | null;
  metrics: GameMetricsByKind[K];
  startedAt: Date;
  completedAt: Date;
  idempotencyKey?: string;
  rulesVersion?: number | null;
  stateSchemaVersion?: number | null;
};

export class GameResultInvariantError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function assertSafeNonNegative(value: number | null | undefined, field: string) {
  if (
    value != null &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new GameResultInvariantError(`invalid_${field}`);
  }
}

function assertPositiveVersion(value: number | null | undefined, field: string) {
  if (value != null && (!Number.isInteger(value) || value <= 0)) {
    throw new GameResultInvariantError(`invalid_${field}`);
  }
}

function isP2002(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function sameIdentity<K extends OfficialGameKind>(
  row: GameResult,
  input: WriteGameResultInput<K>,
  idempotencyKey: string,
): boolean {
  return (
    row.idempotencyKey === idempotencyKey &&
    row.gameKind === input.gameKind &&
    row.boardId === input.boardId &&
    row.classroomId === input.classroomId &&
    row.studentId === input.studentId &&
    row.sourceType === input.sourceType &&
    row.sourceId === input.sourceId
  );
}

export async function writeGameResult<K extends OfficialGameKind>(
  tx: Prisma.TransactionClient,
  input: WriteGameResultInput<K>,
): Promise<GameResult> {
  assertSafeNonNegative(input.score, "score");
  assertSafeNonNegative(input.durationMs, "duration_ms");
  assertPositiveVersion(input.rulesVersion, "rules_version");
  assertPositiveVersion(input.stateSchemaVersion, "state_schema_version");
  if (input.completedAt.getTime() < input.startedAt.getTime()) {
    throw new GameResultInvariantError("invalid_time_order");
  }
  if (!input.sourceId.trim()) {
    throw new GameResultInvariantError("missing_source_id");
  }

  const metrics = parseGameMetrics(input.gameKind, input.metrics);
  const [board, student] = await Promise.all([
    tx.board.findUnique({
      where: { id: input.boardId },
      select: { classroomId: true, layout: true },
    }),
    tx.student.findUnique({
      where: { id: input.studentId },
      select: { classroomId: true },
    }),
  ]);
  if (
    !board ||
    board.classroomId !== input.classroomId ||
    board.layout !== input.gameKind
  ) {
    throw new GameResultInvariantError("invalid_board_identity");
  }
  if (!student || student.classroomId !== input.classroomId) {
    throw new GameResultInvariantError("invalid_student_identity");
  }

  const idempotencyKey =
    input.idempotencyKey ??
    `${input.gameKind}:${input.sourceId}:${input.studentId}`;
  if (idempotencyKey.length < 1 || idempotencyKey.length > 255) {
    throw new GameResultInvariantError("invalid_idempotency_key");
  }

  const existing = await tx.gameResult.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (!sameIdentity(existing, input, idempotencyKey)) {
      throw new GameResultInvariantError("idempotency_conflict");
    }
    return existing;
  }

  const durationMs =
    input.durationMs ??
    Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  assertSafeNonNegative(durationMs, "duration_ms");

  try {
    return await tx.gameResult.create({
      data: {
        gameKind: input.gameKind,
        boardId: input.boardId,
        classroomId: input.classroomId,
        studentId: input.studentId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        outcome: input.outcome,
        score: input.score == null ? null : BigInt(input.score),
        durationMs: durationMs == null ? null : BigInt(durationMs),
        metrics: metrics as Prisma.InputJsonObject,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        idempotencyKey,
        rulesVersion: input.rulesVersion ?? null,
        stateSchemaVersion: input.stateSchemaVersion ?? null,
      },
    });
  } catch (error) {
    if (!isP2002(error)) throw error;
    const raced = await tx.gameResult.findUnique({
      where: { idempotencyKey },
    });
    if (!raced || !sameIdentity(raced, input, idempotencyKey)) {
      throw new GameResultInvariantError("idempotency_conflict");
    }
    return raced;
  }
}
