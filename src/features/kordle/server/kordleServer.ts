// BC-2 Kordle server helpers. Pure functions that wrap Prisma + engine so
// route handlers stay thin and testable.

import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { evaluateGuess, validateGuess } from "../engine";
import type {
  GuessFeedback,
  KordleEngineConfig,
  KordlePublicState,
  KordleWinnerStats,
} from "../engine";

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
  // The partial unique index on (puzzleId, studentId) / (puzzleId, vibePlaySessionId)
  // guarantees idempotency, but we still try-then-create so the read path
  // does not need a follow-up write.
  const existing = await db.kordleAttempt.findFirst({
    where: {
      puzzleId: opts.puzzleId,
      ...(opts.studentId
        ? { studentId: opts.studentId }
        : opts.vibePlaySessionId
          ? { vibePlaySessionId: opts.vibePlaySessionId }
          : { teacherUserId: opts.teacherUserId }),
    },
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
  } catch (err: unknown) {
    // P2002 unique violation: another request created the row between our
    // findFirst and create. Re-read and return that row.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      const again = await db.kordleAttempt.findFirst({
        where: {
          puzzleId: opts.puzzleId,
          ...(opts.studentId
            ? { studentId: opts.studentId }
            : opts.vibePlaySessionId
              ? { vibePlaySessionId: opts.vibePlaySessionId }
              : { teacherUserId: opts.teacherUserId }),
        },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw err;
  }
}

export interface SubmitGuessInput {
  attemptId: string;
  rawGuess: string;
  studentId: string | null;
  vibePlaySessionId: string | null;
  teacherUserId?: string | null;
}

type KordleTurnState = KordlePublicState["turn"];

function materializeGuessRows(
  guesses: Array<{ guessIndex: number; feedback: unknown }>,
): GuessFeedback[] {
  const rows: GuessFeedback[] = [];
  for (const guess of guesses) {
    while (rows.length < guess.guessIndex - 1) {
      rows.push([]);
    }
    rows[guess.guessIndex - 1] = guess.feedback as unknown as GuessFeedback;
  }
  return rows;
}

async function loadWinnerStats(
  client: Prisma.TransactionClient | typeof db,
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
    const bestGuess = Math.min(...solved.map((attempt) => attempt.solvedAtGuess ?? Infinity));
    if (!Number.isFinite(bestGuess)) return;
    const winners = solved.filter((attempt) => attempt.solvedAtGuess === bestGuess);
    const roundWinners = winners.map((attempt) => ({
      studentId: attempt.studentId!,
      name: attempt.student?.name ?? "이름 없음",
    }));

    for (const winner of roundWinners) {
      const current = wins.get(winner.studentId);
      if (current) {
        current.wins += 1;
      } else {
        wins.set(winner.studentId, { ...winner, wins: 1 });
      }
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
      (a, b) => b.wins - a.wins || a.name.localeCompare(b.name, "ko-KR"),
    ),
    rounds: rounds.slice(-6).reverse(),
  };
}

async function getTurnState(
  client: Prisma.TransactionClient | typeof db,
  puzzleId: string,
  maxGuesses: number,
  actorGuessCount: number,
  actorStatus: "IN_PROGRESS" | "WON" | "LOST" | "ABANDONED",
  actorStartedAt: Date,
  isStudentActor: boolean,
): Promise<KordleTurnState> {
  const studentAttempts = await client.kordleAttempt.findMany({
    where: {
      puzzleId,
      studentId: { not: null },
    },
    select: {
      startedAt: true,
      status: true,
      _count: { select: { guesses: true } },
    },
  });

  const firstGuess = await client.kordleGuess.findFirst({
    where: {
      guessIndex: 1,
      attempt: {
        puzzleId,
        studentId: { not: null },
      },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const joinedAttempts = firstGuess
    ? studentAttempts.filter(
        (attempt) =>
          attempt._count.guesses > 0 || attempt.startedAt <= firstGuess.createdAt,
      )
    : studentAttempts;
  const latestGuessBeforeJoin = isStudentActor
    ? await client.kordleGuess.findFirst({
        where: {
          createdAt: { lte: actorStartedAt },
          attempt: {
            puzzleId,
            studentId: { not: null },
          },
        },
        orderBy: { createdAt: "desc" },
        select: { guessIndex: true },
      })
    : null;
  const lateJoinTargetGuessIndex =
    isStudentActor && actorGuessCount === 0 && latestGuessBeforeJoin
      ? Math.min(latestGuessBeforeJoin.guessIndex + 1, maxGuesses)
      : null;
  const activeAttempts = joinedAttempts.filter((attempt) => attempt.status === "IN_PROGRESS");
  if (activeAttempts.length === 0) {
    const currentGuessIndex =
      actorStatus === "IN_PROGRESS" && actorGuessCount < maxGuesses
        ? actorGuessCount + 1
        : null;
    return {
      currentGuessIndex,
      nextGuessIndex: currentGuessIndex,
      submittedCount: joinedAttempts.length,
      totalCount: joinedAttempts.length,
      isWaiting: false,
      isPendingJoin: false,
    };
  }

  const currentGuessIndex = Math.min(
    Math.min(...activeAttempts.map((attempt) => attempt._count.guesses)) + 1,
    maxGuesses,
  );
  const submittedCount = activeAttempts.filter(
    (attempt) => attempt._count.guesses >= currentGuessIndex,
  ).length;
  const pendingJoin =
    actorStatus === "IN_PROGRESS" &&
    lateJoinTargetGuessIndex !== null &&
    currentGuessIndex < lateJoinTargetGuessIndex;
  const actorNextGuessIndex =
    actorStatus === "IN_PROGRESS"
      ? pendingJoin
        ? lateJoinTargetGuessIndex
        : actorGuessCount >= currentGuessIndex
          ? Math.min(actorGuessCount + 1, maxGuesses)
          : (lateJoinTargetGuessIndex ?? currentGuessIndex)
      : null;

  return {
    currentGuessIndex,
    nextGuessIndex: actorNextGuessIndex,
    submittedCount,
    totalCount: activeAttempts.length,
    isWaiting:
      actorStatus === "IN_PROGRESS" &&
      (pendingJoin || actorGuessCount >= currentGuessIndex) &&
      submittedCount < activeAttempts.length,
    isPendingJoin: pendingJoin,
  };
}

export async function submitGuess(
  opts: SubmitGuessInput,
): Promise<{ ok: true; state: KordlePublicState } | { ok: false; reason: string }> {
  if (!opts.studentId && !opts.vibePlaySessionId && !opts.teacherUserId) {
    return { ok: false, reason: "unauthenticated" };
  }
  if ([opts.studentId, opts.vibePlaySessionId, opts.teacherUserId].filter(Boolean).length > 1) {
    return { ok: false, reason: "ambiguous_actor" };
  }
  return await db.$transaction(async (tx) => {
    // Lock the attempt row for the rest of this transaction. Other
    // concurrent guess submissions will queue behind us and read the
    // updated guesses count + status.
    const lockRows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "KordleAttempt" WHERE id = ${opts.attemptId} FOR UPDATE`;
    if (lockRows.length === 0) {
      return { ok: false as const, reason: "attempt_not_found" };
    }

    const attempt = await tx.kordleAttempt.findUnique({
      where: { id: opts.attemptId },
      include: {
        puzzle: { include: { game: true, solutionWord: true } },
        guesses: { orderBy: { guessIndex: "asc" } },
      },
    });
    if (!attempt) return { ok: false as const, reason: "attempt_not_found" };

    // Ownership check. Students, Vibe sessions, and teachers each have their
    // own attempt rows so every actor solves the same puzzle independently.
    if (opts.studentId) {
      if (attempt.studentId !== opts.studentId) {
        return { ok: false as const, reason: "forbidden" };
      }
    } else if (opts.vibePlaySessionId) {
      if (attempt.vibePlaySessionId !== opts.vibePlaySessionId) {
        return { ok: false as const, reason: "forbidden" };
      }
    } else if (opts.teacherUserId) {
      if (attempt.teacherUserId !== opts.teacherUserId) {
        return { ok: false as const, reason: "forbidden" };
      }
      const board = await tx.board.findFirst({
        where: {
          id: attempt.puzzle.game.boardId,
          members: {
            some: {
              userId: opts.teacherUserId,
              role: { in: ["owner", "editor"] },
            },
          },
        },
        select: { id: true },
      });
      if (!board) return { ok: false as const, reason: "forbidden" };
    } else {
      return { ok: false as const, reason: "forbidden" };
    }

    // Reject if the attempt is already closed.
    if (attempt.status !== "IN_PROGRESS") {
      return { ok: false as const, reason: "puzzle_closed" };
    }

    // Reject if the puzzle itself is not in a playable state.
    const now = new Date();
    if (
      attempt.puzzle.status === "DRAFT" ||
      attempt.puzzle.status === "ARCHIVED" ||
      attempt.puzzle.status === "CLOSED"
    ) {
      return { ok: false as const, reason: "puzzle_not_playable" };
    }
    if (attempt.puzzle.status === "SCHEDULED" && attempt.puzzle.startsAt && attempt.puzzle.startsAt > now) {
      return { ok: false as const, reason: "puzzle_not_playable" };
    }
    if (attempt.puzzle.endsAt && attempt.puzzle.endsAt < now) {
      return { ok: false as const, reason: "puzzle_not_playable" };
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
      return { ok: false as const, reason: validation.reason };
    }

    const turnBeforeGuess = await getTurnState(
      tx,
      attempt.puzzleId,
      config.maxGuesses,
      attempt.guesses.length,
      attempt.status,
      attempt.startedAt,
      !!attempt.studentId,
    );
    const guessIndex = turnBeforeGuess.nextGuessIndex;
    if (guessIndex === null || guessIndex > config.maxGuesses) {
      return { ok: false as const, reason: "no_attempts_left" };
    }
    if (
      turnBeforeGuess.currentGuessIndex !== null &&
      guessIndex !== turnBeforeGuess.currentGuessIndex
    ) {
      return { ok: false as const, reason: "waiting_for_turn" };
    }

    const result = evaluateGuess(attempt.puzzle.solutionWord.text, opts.rawGuess, config);

    await tx.kordleGuess.create({
      data: {
        attemptId: attempt.id,
        guessIndex,
        guess: opts.rawGuess,
        feedback: result.feedback as unknown as object,
        isCorrect: result.isCorrect,
      },
    });

    let nextStatus: "IN_PROGRESS" | "WON" | "LOST" = "IN_PROGRESS";
    if (result.isCorrect) nextStatus = "WON";
    else if (guessIndex >= config.maxGuesses) nextStatus = "LOST";

    const updated = await tx.kordleAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextStatus,
        solvedAtGuess: result.isCorrect ? guessIndex : attempt.solvedAtGuess,
        completedAt: nextStatus === "IN_PROGRESS" ? null : new Date(),
      },
    });

    const allGuesses = materializeGuessRows([
      ...attempt.guesses.map((g) => ({
        guessIndex: g.guessIndex,
        feedback: g.feedback,
      })),
      { guessIndex, feedback: result.feedback },
    ]);
    const absentLetters: string[] = [];
    for (const fb of allGuesses) {
      for (const lf of fb) {
        if (lf.state === "absent" && !absentLetters.includes(lf.char)) {
          absentLetters.push(lf.char);
        }
      }
    }
    const turn = await getTurnState(
      tx,
      attempt.puzzleId,
      config.maxGuesses,
      allGuesses.length,
      updated.status,
      attempt.startedAt,
      !!attempt.studentId,
    );
    const winnerStats = await loadWinnerStats(tx, attempt.puzzle.game.boardId);

    return {
      ok: true as const,
      state: {
        puzzleId: attempt.puzzleId,
        status: updated.status,
        wordLength: config.wordLength,
        maxGuesses: config.maxGuesses,
        guesses: allGuesses,
        nextGuessIndex: turn.nextGuessIndex,
        absentLetters,
        solvedAtGuess: updated.solvedAtGuess,
        turn,
        winnerStats,
      },
    };
  });
}

export async function getPublicState(opts: {
  attemptId: string;
  studentId: string | null;
  vibePlaySessionId?: string | null;
  teacherUserId?: string | null;
}): Promise<KordlePublicState | null> {
  const attempt = await db.kordleAttempt.findUnique({
    where: { id: opts.attemptId },
    include: {
      puzzle: { include: { game: true } },
      guesses: { orderBy: { guessIndex: "asc" } },
    },
  });
  if (!attempt) return null;
  // Strict ownership: caller must match one of the FKs on the attempt.
  if (opts.studentId && attempt.studentId !== opts.studentId) return null;
  if (opts.vibePlaySessionId && attempt.vibePlaySessionId !== opts.vibePlaySessionId) {
    return null;
  }
  if (opts.teacherUserId) {
    if (attempt.teacherUserId !== opts.teacherUserId) return null;
    const board = await db.board.findFirst({
      where: {
        id: attempt.puzzle.game.boardId,
        members: {
          some: {
            userId: opts.teacherUserId,
            role: { in: ["owner", "editor"] },
          },
        },
      },
      select: { id: true },
    });
    if (!board) return null;
  } else if (!opts.studentId && !opts.vibePlaySessionId) {
    return null;
  }
  const config: KordleEngineConfig = {
    wordLength: attempt.puzzle.game.wordLength,
    maxGuesses: attempt.puzzle.game.maxGuesses,
    locale: attempt.puzzle.game.locale,
  };
  const allGuesses = materializeGuessRows(attempt.guesses);
  const absentLetters: string[] = [];
  for (const fb of allGuesses) {
    for (const lf of fb) {
      if (lf.state === "absent" && !absentLetters.includes(lf.char)) {
        absentLetters.push(lf.char);
      }
    }
  }
  const turn = await getTurnState(
    db,
    attempt.puzzleId,
    config.maxGuesses,
    attempt.guesses.length,
    attempt.status,
    attempt.startedAt,
    !!attempt.studentId,
  );
  const winnerStats = await loadWinnerStats(db, attempt.puzzle.game.boardId);
  return {
    puzzleId: attempt.puzzleId,
    status: attempt.status,
    wordLength: config.wordLength,
    maxGuesses: config.maxGuesses,
    guesses: allGuesses,
    nextGuessIndex: turn.nextGuessIndex,
    absentLetters,
    solvedAtGuess: attempt.solvedAtGuess,
    turn,
    winnerStats,
  };
}
