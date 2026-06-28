// BC-2 Kordle server helpers. Pure functions that wrap Prisma + engine so
// route handlers stay thin and testable.

import "server-only";

import { db } from "@/lib/db";
import { evaluateGuess, validateGuess } from "../engine";
import type { KordleEngineConfig, KordlePublicState, GuessFeedback } from "../engine";

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

    const guessIndex = attempt.guesses.length + 1;
    if (guessIndex > config.maxGuesses) {
      return { ok: false as const, reason: "no_attempts_left" };
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

    const allGuesses: GuessFeedback[] = [
      ...attempt.guesses.map((g) => g.feedback as unknown as GuessFeedback),
      result.feedback,
    ];
    const absentLetters: string[] = [];
    for (const fb of allGuesses) {
      for (const lf of fb) {
        if (lf.state === "absent" && !absentLetters.includes(lf.char)) {
          absentLetters.push(lf.char);
        }
      }
    }

    return {
      ok: true as const,
      state: {
        puzzleId: attempt.puzzleId,
        status: updated.status,
        wordLength: config.wordLength,
        maxGuesses: config.maxGuesses,
        guesses: allGuesses,
        nextGuessIndex: updated.status === "IN_PROGRESS" ? guessIndex + 1 : null,
        absentLetters,
        solvedAtGuess: updated.solvedAtGuess,
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
  const allGuesses: GuessFeedback[] = attempt.guesses.map(
    (g) => g.feedback as unknown as GuessFeedback,
  );
  const absentLetters: string[] = [];
  for (const fb of allGuesses) {
    for (const lf of fb) {
      if (lf.state === "absent" && !absentLetters.includes(lf.char)) {
        absentLetters.push(lf.char);
      }
    }
  }
  return {
    puzzleId: attempt.puzzleId,
    status: attempt.status,
    wordLength: config.wordLength,
    maxGuesses: config.maxGuesses,
    guesses: allGuesses,
    nextGuessIndex:
      attempt.status === "IN_PROGRESS" ? attempt.guesses.length + 1 : null,
    absentLetters,
    solvedAtGuess: attempt.solvedAtGuess,
  };
}
