import { z } from "zod";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { scheduleSpeedGameChange } from "@/lib/realtime-server";
import {
  authenticateGameViewer,
  commandSpeedGameParticipant,
  IdempotencyConflictError,
  SpeedRunCommandError,
} from "@/lib/speed-game/runtime";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";

type Params = { params: Promise<{ gameId: string }> };

const BodySchema = z
  .object({
    requestId: z.string().min(1).max(128),
    runId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    action: z.enum(["join", "ready", "forfeit"]),
  })
  .strict();

export async function POST(req: Request, { params }: Params) {
  const { gameId } = await params;
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { boardId: true },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(game.boardId);
  if (auth.kind !== "student") {
    return jsonPrivateNoStore(
      { error: auth.kind === "unauthorized" ? "unauthorized" : "student_required" },
      { status: auth.kind === "unauthorized" ? 401 : 403 },
    );
  }
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await commandSpeedGameParticipant({
      gameId,
      runId: parsed.data.runId,
      requestId: parsed.data.requestId,
      expectedVersion: parsed.data.expectedVersion,
      action: parsed.data.action,
      studentId: auth.studentId,
      actorSubject: `student:${auth.studentId}`,
    });
    if (!result.replayed) {
      scheduleSpeedGameChange(gameId, `participant-${parsed.data.action}`);
    }
    return jsonPrivateNoStore({
      ...result,
      game: sanitizeGameSnapshotForStudent(result.game, auth.studentId),
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    if (error instanceof SpeedRunCommandError) {
      return jsonPrivateNoStore(
        {
          error: error.code,
          ...(error.snapshot
            ? {
                game: sanitizeGameSnapshotForStudent(
                  error.snapshot,
                  auth.studentId,
                ),
              }
            : {}),
        },
        { status: error.status },
      );
    }
    console.error("[POST /api/speed-game/games/:gameId/participant]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
