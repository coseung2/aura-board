import { NextResponse } from "next/server";
import { z } from "zod";
import type { KordlePuzzleStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { announceKordlePuzzleChange } from "@/lib/realtime-broadcast";
import { normalizeWord } from "@/features/kordle/engine";
import {
  closeKordlePuzzleAttempts,
} from "@/features/kordle/server/kordleServer";
import {
  IdempotencyConflictError,
  withPlayRequestReceipt,
} from "@/lib/game-platform/idempotency";
import {
  KORDLE_WORD_LENGTH,
  resolveRandomKordleSolution,
  type KordleLocale,
} from "@/features/kordle/server/kordleWords";

type Params = { params: Promise<{ boardId: string }> };

const WORD_LENGTH = KORDLE_WORD_LENGTH;

const CreatePuzzleSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    locale: z.enum(["en-US", "ko-KR"]),
    solution: z.string().trim().max(30).optional(),
  })
  .strict();

const PuzzleActionSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    action: z.enum(["start", "stop", "advance"]),
    puzzleId: z.string().min(1),
    expectedGuessIndex: z.number().int().min(1).optional(),
  })
  .strict();

type PuzzleSnapshot = {
  id: string;
  status: KordlePuzzleStatus;
  version: number;
  startsAt: string | null;
  endsAt: string | null;
  currentGuessIndex: number;
};

type StoredPuzzleResponse =
  | {
      ok: true;
      response: {
        requestId: string;
        previousVersion: number;
        version: number;
        puzzle: PuzzleSnapshot;
        game?: {
          id: string;
          locale: string;
          wordLength: number;
          maxGuesses: number;
        };
      };
    }
  | { ok: false; error: string; puzzle?: PuzzleSnapshot };

function safeVersion(version: bigint): number {
  const value = Number(version);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("kordle_version_out_of_range");
  }
  return value;
}

function serializePuzzle(puzzle: {
  id: string;
  status: KordlePuzzleStatus;
  version: bigint;
  startsAt: Date | null;
  endsAt: Date | null;
  currentGuessIndex: number;
}): PuzzleSnapshot {
  return {
    id: puzzle.id,
    status: puzzle.status,
    version: safeVersion(puzzle.version),
    startsAt: puzzle.startsAt?.toISOString() ?? null,
    endsAt: puzzle.endsAt?.toISOString() ?? null,
    currentGuessIndex: puzzle.currentGuessIndex,
  };
}

async function resolveTeacherBoard(boardIdOrSlug: string, userId: string) {
  return db.board.findFirst({
    where: {
      OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }],
      members: {
        some: {
          userId,
          role: { in: ["owner", "editor"] },
        },
      },
    },
    select: { id: true, title: true },
  });
}

async function closeOtherPlayablePuzzles(
  tx: Prisma.TransactionClient,
  input: { gameId: string; exceptPuzzleId?: string; completedAt: Date },
) {
  const puzzles = await tx.kordlePuzzle.findMany({
    where: {
      gameId: input.gameId,
      ...(input.exceptPuzzleId ? { id: { not: input.exceptPuzzleId } } : {}),
      status: { in: ["DRAFT", "LIVE", "SCHEDULED"] },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const puzzle of puzzles) {
    await closeKordlePuzzleAttempts(tx, puzzle.id, input.completedAt);
  }
  if (puzzles.length > 0) {
    await tx.kordlePuzzle.updateMany({
      where: { id: { in: puzzles.map((puzzle) => puzzle.id) } },
      data: {
        status: "CLOSED",
        endsAt: input.completedAt,
        version: { increment: 1 },
      },
    });
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const student = await getCurrentStudent();
  if (!student) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true },
  });
  if (!board) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const game = await db.kordleGame.findUnique({
    where: { boardId: board.id },
    select: {
      id: true,
      wordLength: true,
      maxGuesses: true,
      locale: true,
      board: { select: { classroomId: true } },
      puzzles: {
        where: { status: { in: ["DRAFT", "LIVE", "SCHEDULED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          version: true,
          startsAt: true,
          endsAt: true,
          currentGuessIndex: true,
          attempts: {
            where: { studentId: { not: null } },
            orderBy: { startedAt: "asc" },
            select: {
              id: true,
              startedAt: true,
              student: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  if (game.board.classroomId !== student.classroomId) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }
  const puzzle = game.puzzles[0] ?? null;
  return jsonPrivateNoStore({
    gameId: game.id,
    wordLength: game.wordLength,
    maxGuesses: game.maxGuesses,
    locale: game.locale,
    puzzle: puzzle
      ? {
          ...serializePuzzle(puzzle),
          participants: puzzle.attempts
            .filter((attempt) => attempt.student)
            .map((attempt) => ({
              id: attempt.student!.id,
              name: attempt.student!.name,
              joinedAt: attempt.startedAt.toISOString(),
            })),
        }
      : null,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = CreatePuzzleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const board = await resolveTeacherBoard(boardIdOrSlug, user.id);
  if (!board) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const locale = parsed.data.locale as KordleLocale;
  const selectedWord =
    parsed.data.solution && parsed.data.solution.length > 0
      ? {
          text: parsed.data.solution,
          normalized: normalizeWord(parsed.data.solution, locale),
        }
      : await resolveRandomKordleSolution({
          boardId: board.id,
          locale,
          wordLength: WORD_LENGTH,
        });
  if (selectedWord.normalized.length !== WORD_LENGTH) {
    return NextResponse.json(
      {
        error: "wrong_length",
        wordLength: WORD_LENGTH,
        normalizedLength: selectedWord.normalized.length,
      },
      { status: 400 },
    );
  }

  try {
    const receipt = await db.$transaction(async (tx) =>
      withPlayRequestReceipt(
        tx,
        {
          actorSubject: `teacher:${user.id}`,
          scopeType: "kordle_puzzle_command",
          scopeId: board.id,
          requestId: parsed.data.requestId,
          requestBody: parsed.data,
        },
        async () => {
          await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${board.id} FOR UPDATE`;
          const currentPuzzle = await tx.kordlePuzzle.findFirst({
            where: { game: { boardId: board.id } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              version: true,
              startsAt: true,
              endsAt: true,
              currentGuessIndex: true,
            },
          });
          const previousVersion = currentPuzzle
            ? safeVersion(currentPuzzle.version)
            : 0;
          if (previousVersion !== parsed.data.expectedVersion) {
            return {
              ok: false,
              error: "version_conflict",
              ...(currentPuzzle
                ? { puzzle: serializePuzzle(currentPuzzle) }
                : {}),
            } as unknown as Prisma.InputJsonObject;
          }

          const game = await tx.kordleGame.upsert({
            where: { boardId: board.id },
            update: {
              title: board.title || "꼬들",
              locale,
              wordLength: WORD_LENGTH,
              maxGuesses: 6,
            },
            create: {
              boardId: board.id,
              title: board.title || "꼬들",
              locale,
              wordLength: WORD_LENGTH,
              maxGuesses: 6,
              mode: "CLASSIC",
            },
          });
          const now = new Date();
          await closeOtherPlayablePuzzles(tx, {
            gameId: game.id,
            completedAt: now,
          });
          const word = await tx.kordleWord.upsert({
            where: {
              locale_normalized: {
                locale,
                normalized: selectedWord.normalized,
              },
            },
            update: {
              text: selectedWord.text,
              length: WORD_LENGTH,
              isAllowed: true,
              isSolution: true,
            },
            create: {
              text: selectedWord.text,
              normalized: selectedWord.normalized,
              length: WORD_LENGTH,
              locale,
              isAllowed: true,
              isSolution: true,
            },
          });
          const created = await tx.kordlePuzzle.create({
            data: {
              gameId: game.id,
              solutionWordId: word.id,
              status: "DRAFT",
              startsAt: null,
            },
            select: {
              id: true,
              status: true,
              version: true,
              startsAt: true,
              endsAt: true,
              currentGuessIndex: true,
            },
          });
          const puzzle = serializePuzzle(created);
          return {
            ok: true,
            response: {
              requestId: parsed.data.requestId,
              previousVersion,
              version: puzzle.version,
              puzzle,
              game: {
                id: game.id,
                locale: game.locale,
                wordLength: game.wordLength,
                maxGuesses: game.maxGuesses,
              },
            },
          } as unknown as Prisma.InputJsonObject;
        },
      ),
    );
    const stored = receipt.response as unknown as StoredPuzzleResponse;
    if (!stored.ok) {
      return NextResponse.json(stored, {
        status: stored.error === "version_conflict" ? 409 : 400,
      });
    }
    return NextResponse.json({
      ...stored.response,
      replayed: receipt.replayed,
      gameId: stored.response.game?.id,
      locale: stored.response.game?.locale,
      wordLength: stored.response.game?.wordLength,
      maxGuesses: stored.response.game?.maxGuesses,
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[POST /api/kordle/boards/:boardId/puzzle]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = PuzzleActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const board = await resolveTeacherBoard(boardIdOrSlug, user.id);
  if (!board) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const receipt = await db.$transaction(async (tx) =>
      withPlayRequestReceipt(
        tx,
        {
          actorSubject: `teacher:${user.id}`,
          scopeType: "kordle_puzzle_command",
          scopeId: parsed.data.puzzleId,
          requestId: parsed.data.requestId,
          requestBody: parsed.data,
        },
        async () => {
          const lockRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "KordlePuzzle" WHERE id = ${parsed.data.puzzleId} FOR UPDATE
          `;
          if (lockRows.length === 0) {
            return {
              ok: false,
              error: "puzzle_not_found",
            } as unknown as Prisma.InputJsonObject;
          }
          const puzzle = await tx.kordlePuzzle.findFirst({
            where: {
              id: parsed.data.puzzleId,
              game: { boardId: board.id },
            },
            select: {
              id: true,
              gameId: true,
              status: true,
              version: true,
              startsAt: true,
              endsAt: true,
              currentGuessIndex: true,
              game: { select: { maxGuesses: true } },
            },
          });
          if (!puzzle) {
            return {
              ok: false,
              error: "puzzle_not_found",
            } as unknown as Prisma.InputJsonObject;
          }
          const previousVersion = safeVersion(puzzle.version);
          if (previousVersion !== parsed.data.expectedVersion) {
            return {
              ok: false,
              error: "version_conflict",
              puzzle: serializePuzzle(puzzle),
            } as unknown as Prisma.InputJsonObject;
          }

          let updated:
            | {
                id: string;
                status: KordlePuzzleStatus;
                version: bigint;
                startsAt: Date | null;
                endsAt: Date | null;
                currentGuessIndex: number;
              }
            | null = null;
          const now = new Date();

          if (parsed.data.action === "stop") {
            if (puzzle.status !== "CLOSED" && puzzle.status !== "ARCHIVED") {
              await closeKordlePuzzleAttempts(tx, puzzle.id, now);
              updated = await tx.kordlePuzzle.update({
                where: { id: puzzle.id },
                data: {
                  status: "CLOSED",
                  endsAt: now,
                  version: { increment: 1 },
                },
                select: {
                  id: true,
                  status: true,
                  version: true,
                  startsAt: true,
                  endsAt: true,
                  currentGuessIndex: true,
                },
              });
            } else {
              updated = puzzle;
            }
          } else if (parsed.data.action === "advance") {
            if (puzzle.status !== "LIVE") {
              return {
                ok: false,
                error: "puzzle_not_startable",
                puzzle: serializePuzzle(puzzle),
              } as unknown as Prisma.InputJsonObject;
            }
            const expectedGuessIndex =
              parsed.data.expectedGuessIndex ?? puzzle.currentGuessIndex;
            if (expectedGuessIndex !== puzzle.currentGuessIndex) {
              return {
                ok: false,
                error: "stale_puzzle_advance",
                puzzle: serializePuzzle(puzzle),
              } as unknown as Prisma.InputJsonObject;
            }
            if (puzzle.currentGuessIndex >= puzzle.game.maxGuesses) {
              return {
                ok: false,
                error: "already_last_guess",
                puzzle: serializePuzzle(puzzle),
              } as unknown as Prisma.InputJsonObject;
            }
            const advanced = await tx.kordlePuzzle.updateMany({
              where: {
                id: puzzle.id,
                status: "LIVE",
                version: puzzle.version,
                currentGuessIndex: expectedGuessIndex,
              },
              data: {
                currentGuessIndex: { increment: 1 },
                version: { increment: 1 },
              },
            });
            if (advanced.count !== 1) {
              const latest = await tx.kordlePuzzle.findUnique({
                where: { id: puzzle.id },
                select: {
                  id: true,
                  status: true,
                  version: true,
                  startsAt: true,
                  endsAt: true,
                  currentGuessIndex: true,
                },
              });
              return {
                ok: false,
                error: "version_conflict",
                ...(latest ? { puzzle: serializePuzzle(latest) } : {}),
              } as unknown as Prisma.InputJsonObject;
            }
            updated = await tx.kordlePuzzle.findUnique({
              where: { id: puzzle.id },
              select: {
                id: true,
                status: true,
                version: true,
                startsAt: true,
                endsAt: true,
                currentGuessIndex: true,
              },
            });
          } else {
            if (puzzle.status !== "DRAFT") {
              return {
                ok: false,
                error: "puzzle_not_startable",
                puzzle: serializePuzzle(puzzle),
              } as unknown as Prisma.InputJsonObject;
            }
            await closeOtherPlayablePuzzles(tx, {
              gameId: puzzle.gameId,
              exceptPuzzleId: puzzle.id,
              completedAt: now,
            });
            updated = await tx.kordlePuzzle.update({
              where: { id: puzzle.id },
              data: {
                status: "LIVE",
                currentGuessIndex: 1,
                startsAt: now,
                endsAt: null,
                version: { increment: 1 },
              },
              select: {
                id: true,
                status: true,
                version: true,
                startsAt: true,
                endsAt: true,
                currentGuessIndex: true,
              },
            });
          }

          if (!updated) throw new Error("kordle_puzzle_update_missing");
          const snapshot = serializePuzzle(updated);
          return {
            ok: true,
            response: {
              requestId: parsed.data.requestId,
              previousVersion,
              version: snapshot.version,
              puzzle: snapshot,
            },
          } as unknown as Prisma.InputJsonObject;
        },
      ),
    );
    const stored = receipt.response as unknown as StoredPuzzleResponse;
    if (!stored.ok) {
      const status =
        stored.error === "puzzle_not_found"
          ? 404
          : stored.error === "version_conflict" ||
              stored.error === "stale_puzzle_advance" ||
              stored.error === "puzzle_not_startable" ||
              stored.error === "already_last_guess"
            ? 409
            : 400;
      return NextResponse.json(stored, { status });
    }

    if (!receipt.replayed) {
      await announceKordlePuzzleChange(board.id, {
        puzzleId: stored.response.puzzle.id,
        status: stored.response.puzzle.status,
        currentGuessIndex: stored.response.puzzle.currentGuessIndex,
        updatedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({
      ...stored.response,
      replayed: receipt.replayed,
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[PATCH /api/kordle/boards/:boardId/puzzle]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
