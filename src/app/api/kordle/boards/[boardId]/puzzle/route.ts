import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { normalizeWord } from "@/features/kordle/engine";
import {
  KORDLE_WORD_LENGTH,
  resolveRandomKordleSolution,
  type KordleLocale,
} from "@/features/kordle/server/kordleWords";

type Params = { params: Promise<{ boardId: string }> };

const WORD_LENGTH = KORDLE_WORD_LENGTH;

const CreatePuzzleSchema = z.object({
  locale: z.enum(["en-US", "ko-KR"]),
  solution: z.string().trim().max(30).optional(),
});

const PuzzleActionSchema = z.object({
  action: z.enum(["start", "stop"]),
  puzzleId: z.string().min(1),
});

export async function GET(_req: Request, { params }: Params) {
  // StudentDashboard links to /board/${board.slug}/play/kordle and the
  // page then calls this endpoint with the same dynamic segment, so the
  // param can be either a board id or a slug. Resolve to the canonical
  // board id before looking up the Kordle game.
  const { boardId: boardIdOrSlug } = await params;
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true },
  });
  if (!board) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const boardId = board.id;
  const game = await db.kordleGame.findUnique({
    where: { boardId },
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
          startsAt: true,
          endsAt: true,
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
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  if (game.board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const puzzle = game.puzzles[0] ?? null;
  return NextResponse.json({
    gameId: game.id,
    wordLength: game.wordLength,
    maxGuesses: game.maxGuesses,
    locale: game.locale,
    puzzle: puzzle
      ? {
          id: puzzle.id,
          status: puzzle.status,
          startsAt: puzzle.startsAt,
          endsAt: puzzle.endsAt,
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

  const body = await req.json().catch(() => null);
  const parsed = CreatePuzzleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const board = await db.board.findFirst({
    where: {
      OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }],
      members: {
        some: {
          userId: user.id,
          role: { in: ["owner", "editor"] },
        },
      },
    },
    select: { id: true, title: true },
  });
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
  const rawWord = selectedWord.text;
  const normalized = selectedWord.normalized;
  if (normalized.length !== WORD_LENGTH) {
    return NextResponse.json(
      {
        error: "wrong_length",
        wordLength: WORD_LENGTH,
        normalizedLength: normalized.length,
      },
      { status: 400 },
    );
  }

  const result = await db.$transaction(async (tx) => {
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

    await tx.kordlePuzzle.updateMany({
      where: {
        gameId: game.id,
        status: { in: ["DRAFT", "LIVE", "SCHEDULED"] },
      },
      data: {
        status: "CLOSED",
        endsAt: new Date(),
      },
    });

    const word = await tx.kordleWord.upsert({
      where: {
        locale_normalized: {
          locale,
          normalized,
        },
      },
      update: {
        text: rawWord,
        length: WORD_LENGTH,
        isAllowed: true,
        isSolution: true,
      },
      create: {
        text: rawWord,
        normalized,
        length: WORD_LENGTH,
        locale,
        isAllowed: true,
        isSolution: true,
      },
    });

    const puzzle = await tx.kordlePuzzle.create({
      data: {
        gameId: game.id,
        solutionWordId: word.id,
        status: "DRAFT",
        startsAt: null,
      },
      select: { id: true, status: true, startsAt: true },
    });

    return { game, puzzle };
  });

  return NextResponse.json({
    gameId: result.game.id,
    locale: result.game.locale,
    wordLength: result.game.wordLength,
    maxGuesses: result.game.maxGuesses,
    puzzle: result.puzzle,
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PuzzleActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const board = await db.board.findFirst({
    where: {
      OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }],
      members: {
        some: {
          userId: user.id,
          role: { in: ["owner", "editor"] },
        },
      },
    },
    select: {
      id: true,
    },
  });
  if (!board) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await db.$transaction(async (tx) => {
    const puzzle = await tx.kordlePuzzle.findFirst({
      where: {
        id: parsed.data.puzzleId,
        game: { boardId: board.id },
      },
      select: { id: true, gameId: true, status: true },
    });
    if (!puzzle) return null;

    if (parsed.data.action === "stop") {
      return await tx.kordlePuzzle.update({
        where: { id: puzzle.id },
        data: {
          status: "CLOSED",
          endsAt: new Date(),
        },
        select: { id: true, status: true, startsAt: true },
      });
    }
    if (puzzle.status !== "DRAFT") {
      return "not_startable" as const;
    }

    await tx.kordlePuzzle.updateMany({
      where: {
        gameId: puzzle.gameId,
        id: { not: puzzle.id },
        status: { in: ["LIVE", "SCHEDULED"] },
      },
      data: {
        status: "CLOSED",
        endsAt: new Date(),
      },
    });

    const livePuzzle = await tx.kordlePuzzle.update({
      where: { id: puzzle.id },
      data: {
        status: "LIVE",
        startsAt: new Date(),
        endsAt: null,
      },
      select: { id: true, status: true, startsAt: true },
    });

    return livePuzzle;
  });

  if (!result) {
    return NextResponse.json({ error: "puzzle_not_found" }, { status: 404 });
  }
  if (result === "not_startable") {
    return NextResponse.json({ error: "puzzle_not_startable" }, { status: 409 });
  }

  return NextResponse.json({ puzzle: result });
}
