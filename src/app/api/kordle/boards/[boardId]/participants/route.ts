import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";

type Params = { params: Promise<{ boardId: string }> };

const ACTIVE_PUZZLE_STATUSES = ["DRAFT", "LIVE", "SCHEDULED"] as const;

type AttemptSnapshot = {
  startedAt: Date;
  status: string;
  student: { id: string; name: string } | null;
  guesses: Array<{ guessIndex: number; createdAt: Date }>;
};

function getRoundSnapshot(
  attempts: AttemptSnapshot[],
  maxGuesses: number,
  currentGuessIndex: number,
) {
  const activeAttempts = attempts.filter((attempt) => attempt.status === "IN_PROGRESS" && attempt.student);
  if (activeAttempts.length === 0) {
    return {
      currentGuessIndex: null,
      submittedCount: 0,
      totalCount: 0,
      roundDurationMs: 0,
      roundStartedAt: null,
      roundEndsAt: null,
      remainingMs: 0,
      pendingParticipants: [],
    };
  }

  const activeGuessIndex = Math.min(Math.max(currentGuessIndex, 1), maxGuesses);
  const submittedAttempts = activeAttempts.filter((attempt) =>
    attempt.guesses.some((guess) => guess.guessIndex === activeGuessIndex),
  );
  const pendingParticipants = activeAttempts
    .filter((attempt) => !attempt.guesses.some((guess) => guess.guessIndex === activeGuessIndex))
    .map((attempt) => ({
      id: attempt.student!.id,
      name: attempt.student!.name,
    }));

  return {
    currentGuessIndex: activeGuessIndex,
    submittedCount: submittedAttempts.length,
    totalCount: activeAttempts.length,
    roundDurationMs: 0,
    roundStartedAt: null,
    roundEndsAt: null,
    remainingMs: 0,
    pendingParticipants,
  };
}

export async function GET(req: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
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
    select: { id: true },
  });
  if (!board) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const puzzleId = url.searchParams.get("puzzleId");
  const game = await db.kordleGame.findUnique({
    where: { boardId: board.id },
    select: {
      puzzles: {
        where: {
          ...(puzzleId ? { id: puzzleId } : {}),
          status: { in: [...ACTIVE_PUZZLE_STATUSES] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          startsAt: true,
          currentGuessIndex: true,
          game: { select: { maxGuesses: true } },
          attempts: {
            where: { studentId: { not: null } },
            orderBy: { startedAt: "asc" },
            select: {
              startedAt: true,
              status: true,
              student: { select: { id: true, name: true } },
              guesses: {
                orderBy: { guessIndex: "asc" },
                select: { guessIndex: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  const puzzle = game?.puzzles[0] ?? null;
  const round = puzzle
    ? getRoundSnapshot(puzzle.attempts, puzzle.game.maxGuesses, puzzle.currentGuessIndex)
    : null;
  return jsonPrivateNoStore({
    puzzle: puzzle
      ? {
          id: puzzle.id,
          status: puzzle.status,
          participants: puzzle.attempts
            .filter((attempt) => attempt.student)
            .map((attempt) => ({
              id: attempt.student!.id,
              name: attempt.student!.name,
              joinedAt: attempt.startedAt.toISOString(),
            })),
          round,
        }
      : null,
    serverTime: new Date().toISOString(),
  });
}
