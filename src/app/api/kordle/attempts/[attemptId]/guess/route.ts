import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { announceKordleGuess } from "@/lib/realtime-broadcast";
import { kordleCorrectCount } from "@/features/kordle/realtime";
import { submitGuess } from "@/features/kordle/server/kordleServer";
import { IdempotencyConflictError } from "@/lib/game-platform/idempotency";

const BodySchema = z
  .object({
    requestId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    guess: z.string().min(1).max(50),
    guessIndex: z.number().int().min(1).max(20).optional(),
  })
  .strict();

type Params = { params: Promise<{ attemptId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { attemptId } = await params;
  const student = await getCurrentStudent();
  const user = student ? null : await getCurrentUser().catch(() => null);
  if (!student && !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await submitGuess({
      attemptId,
      requestId: parsed.data.requestId,
      expectedVersion: parsed.data.expectedVersion,
      rawGuess: parsed.data.guess,
      expectedGuessIndex: parsed.data.guessIndex,
      actorSubject: student ? `student:${student.id}` : `teacher:${user!.id}`,
      studentId: student?.id ?? null,
      vibePlaySessionId: null,
      teacherUserId: user?.id ?? null,
    });
    if (!result.ok) {
      const status =
        result.reason === "forbidden"
          ? 403
          : result.reason === "attempt_not_found"
            ? 404
            : result.reason === "version_conflict" ||
                result.reason === "puzzle_closed" ||
                result.reason === "line_not_active"
              ? 409
              : 400;
      return NextResponse.json(
        {
          error: result.reason,
          ...(result.state ? { state: result.state } : {}),
          replayed: result.replayed,
        },
        { status },
      );
    }

    if (!result.replayed) await announceLatestGuess(attemptId);
    return NextResponse.json({
      ...result.response,
      replayed: result.replayed,
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[POST /api/kordle/attempts/:attemptId/guess]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

async function announceLatestGuess(attemptId: string): Promise<void> {
  try {
    const guess = await db.kordleGuess.findFirst({
      where: { attemptId },
      orderBy: [{ createdAt: "desc" }, { guessIndex: "desc" }],
      select: {
        id: true,
        guessIndex: true,
        feedback: true,
        isCorrect: true,
        createdAt: true,
        attempt: {
          select: {
            student: { select: { name: true } },
            teacherUser: { select: { name: true } },
            puzzle: { select: { game: { select: { boardId: true } } } },
          },
        },
      },
    });
    if (!guess) return;

    await announceKordleGuess(guess.attempt.puzzle.game.boardId, {
      id: guess.id,
      name:
        guess.attempt.student?.name ??
        guess.attempt.teacherUser?.name ??
        "참가자",
      guessIndex: guess.guessIndex,
      correctCount: kordleCorrectCount(guess.feedback),
      isCorrect: guess.isCorrect,
      createdAt: guess.createdAt.toISOString(),
    });
  } catch {
    // Realtime invalidation is best effort. The durable command is authoritative.
  }
}
