import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withPlayRequestReceipt } from "@/lib/game-platform/idempotency";
import { writeGameResult } from "@/lib/game-platform/result-writer";
import { evaluateGuess, validateGuess } from "../engine";
import type {
  GuessFeedback,
  KordleCommandResponse,
  KordleEngineConfig,
  KordlePublicState,
  KordleTerminalReason,
  KordleWinnerStats,
} from "../engine";

export const KORDLE_ROUND_DURATION_MS = 0;
const KORDLE_RULES_VERSION = 1;
const KORDLE_STATE_SCHEMA_VERSION = 1;

type KordleClient = Prisma.TransactionClient | typeof db;

type KordleActorIdentity = {
  studentId: string | null;
  vibePlaySessionId?: string | null;
  teacherUserId?: string | null;
};

type StoredKordleCommandResult =
  | { ok: true; response: KordleCommandResponse }
  | { ok: false; reason: string; state?: KordlePublicState };

export async function loadGameConfig(boardId: string): Promise<{
  gameId: string;
  config: KordleEngineConfig;
} | null> {
  const game = await db.kordleGame.findUnique({
    where: { boardId },
    select: { id: true, wordLength: true, maxGuesses: true, locale: true },
  });
  if (!game) return null;
  return {
    gameId: game.id,
    config: {
      wordLength: game.wordLength,
      maxGuesses: game.maxGuesses,
      locale: game.locale,
    },
  };
}

export interface EnsureAttemptInput {
  puzzleId: string;
  studentId: string | null;
  vibePlaySessionId: string | null;
  teacherUserId?: string | null;
}

export async function ensureAttempt(opts: EnsureAttemptInput): Promise<string> {
  const actorCount = [
    opts.studentId,
    opts.vibePlaySessionId,
    opts.teacherUserId,
  ].filter(Boolean).length;
  if (actorCount !== 1) {
    throw new Error("ensureAttempt: must provide exactly one actor");
  }
  const actorWhere = opts.studentId
    ? { studentId: opts.studentId }
    : opts.vibePlaySessionId
      ? { vibePlaySessionId: opts.vibePlaySessionId }
      : { teacherUserId: opts.teacherUserId };
  const existing = await db.kordleAttempt.findFirst({
    where: { puzzleId: opts.puzzleId, ...actorWhere },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await db.kordleAttempt.create({
      data: {
        puzzleId: opts.puzzleId,
        studentId: opts.studentId ?? null,
        vibePlaySessionId: opts.vibePlaySessionId ?? null,
        teacherUserId: opts.teacherUserId ?? null,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const raced = await db.kordleAttempt.findFirst({
        where: { puzzleId: opts.puzzleId, ...actorWhere },
        select: { id: true },
      });
      if (raced) return raced.id;
    }
    throw error;
  }
}

type KordleTurnState = KordlePublicState["turn"];

function materializeGuessRows(
  guesses: Array<{ guessIndex: number; feedback: unknown }>,
): GuessFeedback[] {
  const rows: GuessFeedback[] = [];
  for (const guess of guesses) {
    while (rows.length < guess.guessIndex - 1) rows.push([]);
    rows[guess.guessIndex - 1] = guess.feedback as GuessFeedback;
  }
  return rows;
}

function latestGuessIndex(guesses: Array<{ guessIndex: number }>): number {
  return guesses.reduce((latest, guess) => Math.max(latest, guess.guessIndex), 0);
}

function safeVersion(value: bigint): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new RangeError("kordle_version_out_of_range");
  }
  return version;
}

async function loadWinnerStats(
  client: KordleClient,
  boardId: string,
): Promise<KordleWinnerStats> {
  const puzzles = await client.kordlePuzzle.findMany({
    where: {
      game: { boardId },
      attempts: {
        some: {
          studentId: { not: null },
          status: "WON",
          solvedAtGuess: { not: null },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      attempts: {
        where: {
          studentId: { not: null },
          status: "WON",
          solvedAtGuess: { not: null },
        },
        select: {
          studentId: true,
          solvedAtGuess: true,
          student: { select: { name: true } },
        },
      },
    },
  });

  const wins = new Map<string, { studentId: string; name: string; wins: number }>();
  const rounds: KordleWinnerStats["rounds"] = [];
  puzzles.forEach((puzzle, index) => {
    const solved = puzzle.attempts.filter(
      (attempt) => attempt.studentId && attempt.solvedAtGuess !== null,
    );
    if (solved.length === 0) return;
    const bestGuess = Math.min(
      ...solved.map((attempt) => attempt.solvedAtGuess ?? Number.POSITIVE_INFINITY),
    );
    if (!Number.isFinite(bestGuess)) return;
    const roundWinners = solved
      .filter((attempt) => attempt.solvedAtGuess === bestGuess)
      .map((attempt) => ({
        studentId: attempt.studentId!,
        name: attempt.student?.name ?? "이름 없음",
      }));
    for (const winner of roundWinners) {
      const current = wins.get(winner.studentId);
      if (current) current.wins += 1;
      else wins.set(winner.studentId, { ...winner, wins: 1 });
    }
    rounds.push({
      puzzleId: puzzle.id,
      roundNumber: index + 1,
      winners: roundWinners,
      solvedAtGuess: bestGuess,
    });
  });
  return {
    leaderboard: Array.from(wins.values()).sort(
      (left, right) =>
        right.wins - left.wins || left.name.localeCompare(right.name, "ko-KR"),
    ),
    rounds: rounds.slice(-6).reverse(),
  };
}

async function getTurnState(
  client: KordleClient,
  puzzleId: string,
  puzzleCurrentGuessIndex: number,
  maxGuesses: number,
  actorGuessCount: number,
  actorStatus: "IN_PROGRESS" | "WON" | "LOST" | "ABANDONED",
): Promise<KordleTurnState> {
  const studentAttempts = await client.kordleAttempt.findMany({
    where: { puzzleId, studentId: { not: null } },
    select: {
      status: true,
      guesses: {
        orderBy: { guessIndex: "asc" },
        select: { guessIndex: true },
      },
    },
  });
  const activeAttempts = studentAttempts.filter(
    (attempt) => attempt.status === "IN_PROGRESS",
  );
  const currentGuessIndex =
    actorStatus === "IN_PROGRESS" && actorGuessCount < maxGuesses
      ? Math.min(Math.max(puzzleCurrentGuessIndex, 1), maxGuesses)
      : null;
  if (activeAttempts.length === 0) {
    return {
      currentGuessIndex,
      nextGuessIndex: currentGuessIndex,
      submittedCount: studentAttempts.length,
      totalCount: studentAttempts.length,
      isWaiting: false,
      isPendingJoin: false,
      roundDurationMs: KORDLE_ROUND_DURATION_MS,
      roundStartedAt: null,
      roundEndsAt: null,
      remainingMs: 0,
    };
  }
  if (currentGuessIndex === null) {
    return {
      currentGuessIndex: null,
      nextGuessIndex: null,
      submittedCount: 0,
      totalCount: activeAttempts.length,
      isWaiting: false,
      isPendingJoin: false,
      roundDurationMs: KORDLE_ROUND_DURATION_MS,
      roundStartedAt: null,
      roundEndsAt: null,
      remainingMs: 0,
    };
  }
  const submittedCount = activeAttempts.filter((attempt) =>
    attempt.guesses.some((guess) => guess.guessIndex === currentGuessIndex),
  ).length;
  const actorNextGuessIndex =
    actorStatus === "IN_PROGRESS"
      ? actorGuessCount >= currentGuessIndex
        ? Math.min(actorGuessCount + 1, maxGuesses)
        : currentGuessIndex
      : null;
  return {
    currentGuessIndex,
    nextGuessIndex: actorNextGuessIndex,
    submittedCount,
    totalCount: activeAttempts.length,
    isWaiting:
      actorStatus === "IN_PROGRESS" &&
      actorGuessCount >= currentGuessIndex &&
      currentGuessIndex < maxGuesses,
    isPendingJoin: false,
    roundDurationMs: KORDLE_ROUND_DURATION_MS,
    roundStartedAt: null,
    roundEndsAt: null,
    remainingMs: 0,
  };
}

async function authorizeAttempt(
  client: KordleClient,
  attempt: {
    studentId: string | null;
    vibePlaySessionId: string | null;
    teacherUserId: string | null;
    puzzle: { game: { boardId: string } };
  },
  actor: KordleActorIdentity,
): Promise<boolean> {
  if (actor.studentId) return attempt.studentId === actor.studentId;
  if (actor.vibePlaySessionId) {
    return attempt.vibePlaySessionId === actor.vibePlaySessionId;
  }
  if (!actor.teacherUserId || attempt.teacherUserId !== actor.teacherUserId) {
    return false;
  }
  const board = await client.board.findFirst({
    where: {
      id: attempt.puzzle.game.boardId,
      members: {
        some: {
          userId: actor.teacherUserId,
          role: { in: ["owner", "editor"] },
        },
      },
    },
    select: { id: true },
  });
  return Boolean(board);
}

async function loadPublicState(
  client: KordleClient,
  opts: { attemptId: string } & KordleActorIdentity,
): Promise<KordlePublicState | null> {
  const attempt = await client.kordleAttempt.findUnique({
    where: { id: opts.attemptId },
    include: {
      puzzle: { include: { game: true } },
      guesses: { orderBy: { guessIndex: "asc" } },
    },
  });
  if (!attempt || !(await authorizeAttempt(client, attempt, opts))) return null;

  const config: KordleEngineConfig = {
    wordLength: attempt.puzzle.game.wordLength,
    maxGuesses: attempt.puzzle.game.maxGuesses,
    locale: attempt.puzzle.game.locale,
  };
  const guesses = materializeGuessRows(attempt.guesses);
  const absentLetters: string[] = [];
  for (const feedback of guesses) {
    for (const letter of feedback) {
      if (
        letter.state === "absent" &&
        !absentLetters.includes(letter.char)
      ) {
        absentLetters.push(letter.char);
      }
    }
  }
  const turn = await getTurnState(
    client,
    attempt.puzzleId,
    attempt.puzzle.currentGuessIndex,
    config.maxGuesses,
    latestGuessIndex(attempt.guesses),
    attempt.status,
  );
  const [winnerStats, result] = await Promise.all([
    loadWinnerStats(client, attempt.puzzle.game.boardId),
    attempt.studentId
      ? client.gameResult.findFirst({
          where: {
            gameKind: "kordle",
            sourceType: "kordle_attempt",
            sourceId: attempt.id,
            studentId: attempt.studentId,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    puzzleId: attempt.puzzleId,
    version: safeVersion(attempt.version),
    status: attempt.status,
    terminalReason: attempt.terminalReason as KordleTerminalReason | null,
    resultId: result?.id ?? null,
    wordLength: config.wordLength,
    maxGuesses: config.maxGuesses,
    guesses,
    nextGuessIndex: turn.nextGuessIndex,
    absentLetters,
    solvedAtGuess: attempt.solvedAtGuess,
    turn,
    winnerStats,
  };
}

function terminalMapping(reason: KordleTerminalReason) {
  switch (reason) {
    case "solved":
      return { status: "WON" as const, outcome: "win" as const };
    case "guesses_exhausted":
    case "deadline":
      return { status: "LOST" as const, outcome: "loss" as const };
    case "participant_abandon":
      return { status: "ABANDONED" as const, outcome: "abandoned" as const };
    case "host_ended":
      return { status: "ABANDONED" as const, outcome: "host-ended" as const };
  }
}

export async function finalizeKordleAttempt(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    reason: KordleTerminalReason;
    completedAt: Date;
    solvedAtGuess?: number | null;
  },
): Promise<{ version: number; resultId: string | null }> {
  await tx.$queryRaw`SELECT id FROM "KordleAttempt" WHERE id = ${input.attemptId} FOR UPDATE`;
  const attempt = await tx.kordleAttempt.findUnique({
    where: { id: input.attemptId },
    include: {
      puzzle: {
        include: {
          game: { include: { board: true } },
        },
      },
      _count: { select: { guesses: true } },
    },
  });
  if (!attempt) throw new Error("attempt_not_found");

  const mapping = terminalMapping(input.reason);
  const updated =
    attempt.status === "IN_PROGRESS"
      ? await tx.kordleAttempt.update({
          where: { id: attempt.id },
          data: {
            status: mapping.status,
            terminalReason: input.reason,
            completedAt: input.completedAt,
            solvedAtGuess:
              input.solvedAtGuess === undefined
                ? attempt.solvedAtGuess
                : input.solvedAtGuess,
            version: { increment: 1 },
          },
        })
      : attempt;

  let resultId: string | null = null;
  if (attempt.studentId) {
    const classroomId = attempt.puzzle.game.board.classroomId;
    if (!classroomId) throw new Error("kordle_board_without_classroom");
    const persistedReason =
      (updated.terminalReason as KordleTerminalReason | null) ?? input.reason;
    const persistedMapping = terminalMapping(persistedReason);
    const result = await writeGameResult(tx, {
      gameKind: "kordle",
      boardId: attempt.puzzle.game.boardId,
      classroomId,
      studentId: attempt.studentId,
      sourceType: "kordle_attempt",
      sourceId: attempt.id,
      outcome: persistedMapping.outcome,
      score: null,
      metrics: {
        guessesUsed: attempt._count.guesses,
        maxGuesses: attempt.puzzle.game.maxGuesses,
        wordLength: attempt.puzzle.game.wordLength,
        solved: persistedReason === "solved",
        reason: persistedReason,
      },
      startedAt: attempt.startedAt,
      completedAt: updated.completedAt ?? input.completedAt,
      rulesVersion: KORDLE_RULES_VERSION,
      stateSchemaVersion: KORDLE_STATE_SCHEMA_VERSION,
    });
    resultId = result.id;
  }
  return { version: safeVersion(updated.version), resultId };
}

export async function closeKordlePuzzleAttempts(
  tx: Prisma.TransactionClient,
  puzzleId: string,
  completedAt: Date,
): Promise<number> {
  const attempts = await tx.kordleAttempt.findMany({
    where: { puzzleId, status: "IN_PROGRESS" },
    select: { id: true },
    orderBy: { startedAt: "asc" },
  });
  for (const attempt of attempts) {
    await finalizeKordleAttempt(tx, {
      attemptId: attempt.id,
      reason: "host_ended",
      completedAt,
    });
  }
  return attempts.length;
}

export interface SubmitGuessInput extends KordleActorIdentity {
  attemptId: string;
  requestId: string;
  expectedVersion: number;
  rawGuess: string;
  expectedGuessIndex?: number;
  actorSubject: string;
}

export type SubmitGuessResult =
  | { ok: true; response: KordleCommandResponse; replayed: boolean }
  | {
      ok: false;
      reason: string;
      state?: KordlePublicState;
      replayed: boolean;
    };

export async function submitGuess(
  opts: SubmitGuessInput,
): Promise<SubmitGuessResult> {
  const actorCount = [
    opts.studentId,
    opts.vibePlaySessionId,
    opts.teacherUserId,
  ].filter(Boolean).length;
  if (actorCount === 0) {
    return { ok: false, reason: "unauthenticated", replayed: false };
  }
  if (actorCount !== 1) {
    return { ok: false, reason: "ambiguous_actor", replayed: false };
  }
  if (!Number.isSafeInteger(opts.expectedVersion) || opts.expectedVersion < 0) {
    return { ok: false, reason: "invalid_version", replayed: false };
  }

  return db.$transaction(async (tx) => {
    const receipt = await withPlayRequestReceipt(
      tx,
      {
        actorSubject: opts.actorSubject,
        scopeType: "kordle_attempt_command",
        scopeId: opts.attemptId,
        requestId: opts.requestId,
        requestBody: {
          expectedVersion: opts.expectedVersion,
          guess: opts.rawGuess,
          guessIndex: opts.expectedGuessIndex ?? null,
        },
      },
      async () => {
        const lockRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "KordleAttempt" WHERE id = ${opts.attemptId} FOR UPDATE
        `;
        if (lockRows.length === 0) {
          return { ok: false, reason: "attempt_not_found" } as unknown as Prisma.InputJsonObject;
        }

        const attempt = await tx.kordleAttempt.findUnique({
          where: { id: opts.attemptId },
          include: {
            puzzle: { include: { game: true, solutionWord: true } },
            guesses: { orderBy: { guessIndex: "asc" } },
          },
        });
        if (!attempt) {
          return { ok: false, reason: "attempt_not_found" } as unknown as Prisma.InputJsonObject;
        }
        if (!(await authorizeAttempt(tx, attempt, opts))) {
          return { ok: false, reason: "forbidden" } as unknown as Prisma.InputJsonObject;
        }

        const previousVersion = safeVersion(attempt.version);
        if (previousVersion !== opts.expectedVersion) {
          const state = await loadPublicState(tx, opts);
          return {
            ok: false,
            reason: "version_conflict",
            ...(state ? { state } : {}),
          } as unknown as Prisma.InputJsonObject;
        }
        if (attempt.status !== "IN_PROGRESS") {
          const state = await loadPublicState(tx, opts);
          return {
            ok: false,
            reason: "puzzle_closed",
            ...(state ? { state } : {}),
          } as unknown as Prisma.InputJsonObject;
        }

        const now = new Date();
        if (
          attempt.puzzle.status === "DRAFT" ||
          attempt.puzzle.status === "ARCHIVED" ||
          attempt.puzzle.status === "CLOSED" ||
          (attempt.puzzle.status === "SCHEDULED" &&
            attempt.puzzle.startsAt &&
            attempt.puzzle.startsAt > now) ||
          (attempt.puzzle.endsAt && attempt.puzzle.endsAt < now)
        ) {
          return {
            ok: false,
            reason: "puzzle_not_playable",
          } as unknown as Prisma.InputJsonObject;
        }

        const config: KordleEngineConfig = {
          wordLength: attempt.puzzle.game.wordLength,
          maxGuesses: attempt.puzzle.game.maxGuesses,
          locale: attempt.puzzle.game.locale,
        };
        const validation = await validateGuess(opts.rawGuess, config, {
          isAllowed: async () => true,
        });
        if (!validation.ok) {
          return {
            ok: false,
            reason: validation.reason,
          } as unknown as Prisma.InputJsonObject;
        }

        const turnBeforeGuess = await getTurnState(
          tx,
          attempt.puzzleId,
          attempt.puzzle.currentGuessIndex,
          config.maxGuesses,
          latestGuessIndex(attempt.guesses),
          attempt.status,
        );
        const guessIndex = turnBeforeGuess.nextGuessIndex;
        if (
          opts.expectedGuessIndex !== undefined &&
          opts.expectedGuessIndex !== turnBeforeGuess.currentGuessIndex
        ) {
          return { ok: false, reason: "line_not_active" } as unknown as Prisma.InputJsonObject;
        }
        if (guessIndex === null || guessIndex > config.maxGuesses) {
          return { ok: false, reason: "no_attempts_left" } as unknown as Prisma.InputJsonObject;
        }
        if (
          turnBeforeGuess.currentGuessIndex !== null &&
          guessIndex !== turnBeforeGuess.currentGuessIndex
        ) {
          return { ok: false, reason: "waiting_for_turn" } as unknown as Prisma.InputJsonObject;
        }

        const guessResult = evaluateGuess(
          attempt.puzzle.solutionWord.text,
          opts.rawGuess,
          config,
        );
        await tx.kordleGuess.create({
          data: {
            attemptId: attempt.id,
            guessIndex,
            guess: opts.rawGuess,
            feedback: guessResult.feedback as unknown as object,
            isCorrect: guessResult.isCorrect,
          },
        });

        if (guessResult.isCorrect) {
          await finalizeKordleAttempt(tx, {
            attemptId: attempt.id,
            reason: "solved",
            completedAt: now,
            solvedAtGuess: guessIndex,
          });
        } else if (guessIndex >= config.maxGuesses) {
          await finalizeKordleAttempt(tx, {
            attemptId: attempt.id,
            reason: "guesses_exhausted",
            completedAt: now,
          });
        } else {
          await tx.kordleAttempt.update({
            where: { id: attempt.id },
            data: { version: { increment: 1 } },
          });
        }

        const state = await loadPublicState(tx, opts);
        if (!state) throw new Error("kordle_state_missing_after_command");
        const response: KordleCommandResponse = {
          requestId: opts.requestId,
          previousVersion,
          version: state.version,
          state,
        };
        return {
          ok: true,
          response,
        } as unknown as Prisma.InputJsonObject;
      },
    );

    const stored = receipt.response as unknown as StoredKordleCommandResult;
    return stored.ok
      ? { ok: true, response: stored.response, replayed: receipt.replayed }
      : {
          ok: false,
          reason: stored.reason,
          state: stored.state,
          replayed: receipt.replayed,
        };
  });
}

export async function abandonKordleAttempt(input: {
  attemptId: string;
  requestId: string;
  expectedVersion: number;
  actorSubject: string;
  studentId: string;
}): Promise<SubmitGuessResult> {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    return { ok: false, reason: "invalid_version", replayed: false };
  }
  return db.$transaction(async (tx) => {
    const receipt = await withPlayRequestReceipt(
      tx,
      {
        actorSubject: input.actorSubject,
        scopeType: "kordle_attempt_command",
        scopeId: input.attemptId,
        requestId: input.requestId,
        requestBody: {
          expectedVersion: input.expectedVersion,
          action: "abandon",
        },
      },
      async () => {
        await tx.$queryRaw`
          SELECT id FROM "KordleAttempt" WHERE id = ${input.attemptId} FOR UPDATE
        `;
        const attempt = await tx.kordleAttempt.findUnique({
          where: { id: input.attemptId },
          select: { id: true, studentId: true, version: true, status: true },
        });
        if (!attempt) {
          return { ok: false, reason: "attempt_not_found" } as unknown as Prisma.InputJsonObject;
        }
        if (attempt.studentId !== input.studentId) {
          return { ok: false, reason: "forbidden" } as unknown as Prisma.InputJsonObject;
        }
        const previousVersion = safeVersion(attempt.version);
        if (previousVersion !== input.expectedVersion) {
          const state = await loadPublicState(tx, {
            attemptId: input.attemptId,
            studentId: input.studentId,
          });
          return {
            ok: false,
            reason: "version_conflict",
            ...(state ? { state } : {}),
          } as unknown as Prisma.InputJsonObject;
        }
        if (attempt.status === "IN_PROGRESS") {
          await finalizeKordleAttempt(tx, {
            attemptId: attempt.id,
            reason: "participant_abandon",
            completedAt: new Date(),
          });
        }
        const state = await loadPublicState(tx, {
          attemptId: input.attemptId,
          studentId: input.studentId,
        });
        if (!state) throw new Error("kordle_state_missing_after_abandon");
        return {
          ok: true,
          response: {
            requestId: input.requestId,
            previousVersion,
            version: state.version,
            state,
          },
        } as unknown as Prisma.InputJsonObject;
      },
    );
    const stored = receipt.response as unknown as StoredKordleCommandResult;
    return stored.ok
      ? { ok: true, response: stored.response, replayed: receipt.replayed }
      : {
          ok: false,
          reason: stored.reason,
          state: stored.state,
          replayed: receipt.replayed,
        };
  });
}

export async function getPublicState(
  opts: { attemptId: string } & KordleActorIdentity,
): Promise<KordlePublicState | null> {
  return loadPublicState(db, opts);
}
