import { z } from "zod";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { scheduleSpeedGameChange } from "@/lib/realtime-server";
import {
  authenticateGameViewer,
  IdempotencyConflictError,
  reviewSpeedGameAnswer,
  SpeedRunCommandError,
  submitSpeedGameAnswer,
} from "@/lib/speed-game/runtime";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";

type Params = { params: Promise<{ gameId: string }> };

const SubmitSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    runId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    answer: z.string().trim().min(1).max(200),
    roundId: z.string().min(1).max(128).optional(),
    groupId: z.string().min(1).max(128).optional(),
  })
  .strict();

const ReviewSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    runId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    answerId: z.string().min(1).max(128),
    decision: z.enum(["accepted", "rejected"]),
  })
  .strict();

async function boardIdForGame(gameId: string): Promise<string | null> {
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { boardId: true },
  });
  return game?.boardId ?? null;
}

function commandErrorResponse(error: unknown) {
  if (error instanceof IdempotencyConflictError) {
    return jsonPrivateNoStore({ error: error.code }, { status: error.status });
  }
  if (error instanceof SpeedRunCommandError) {
    return jsonPrivateNoStore(
      {
        error: error.code,
        ...(error.snapshot ? { game: error.snapshot } : {}),
      },
      { status: error.status },
    );
  }
  return null;
}

export async function POST(req: Request, { params }: Params) {
  const receivedAt = new Date();
  const { gameId } = await params;
  const boardId = await boardIdForGame(gameId);
  if (!boardId) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(boardId);
  if (auth.kind !== "student") {
    return jsonPrivateNoStore(
      { error: auth.kind === "unauthorized" ? "unauthorized" : "student_required" },
      { status: auth.kind === "unauthorized" ? 401 : 403 },
    );
  }

  const parsed = SubmitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await submitSpeedGameAnswer({
      gameId,
      runId: parsed.data.runId,
      requestId: parsed.data.requestId,
      expectedVersion: parsed.data.expectedVersion,
      studentId: auth.studentId,
      actorSubject: `student:${auth.studentId}`,
      rawText: parsed.data.answer,
      roundId: parsed.data.roundId,
      groupId: parsed.data.groupId,
      receivedAt,
    });
    if (!result.replayed) scheduleSpeedGameChange(gameId, "answer");
    return jsonPrivateNoStore({
      ...result,
      game: sanitizeGameSnapshotForStudent(result.game, auth.studentId),
    });
  } catch (error) {
    const response = commandErrorResponse(error);
    if (response) return response;
    console.error("[POST /api/speed-game/games/:gameId/answer]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { gameId } = await params;
  const boardId = await boardIdForGame(gameId);
  if (!boardId) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(boardId);
  if (
    auth.kind !== "teacher" ||
    (auth.role !== "owner" && auth.role !== "editor")
  ) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  const parsed = ReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await reviewSpeedGameAnswer({
      gameId,
      runId: parsed.data.runId,
      answerId: parsed.data.answerId,
      requestId: parsed.data.requestId,
      expectedVersion: parsed.data.expectedVersion,
      decision: parsed.data.decision,
      actorSubject: `teacher:${auth.userId}`,
    });
    if (!result.replayed) scheduleSpeedGameChange(gameId, "answer-review");
    return jsonPrivateNoStore(result);
  } catch (error) {
    const response = commandErrorResponse(error);
    if (response) return response;
    console.error("[PATCH /api/speed-game/games/:gameId/answer]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
