import { z } from "zod";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { scheduleSpeedGameChange } from "@/lib/realtime-server";
import {
  authenticateGameViewer,
  commandSpeedGameRun,
  IdempotencyConflictError,
  loadGameSnapshot,
  SpeedRunCommandError,
} from "@/lib/speed-game/runtime";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";

type Params = { params: Promise<{ gameId: string }> };

const PatchSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    runId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    action: z.enum(["start", "next", "finish", "end-early", "rematch"]),
  })
  .strict();

export async function GET(_req: Request, { params }: Params) {
  const { gameId } = await params;
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { boardId: true },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(game.boardId);
  if (auth.kind === "unauthorized") {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await loadGameSnapshot(gameId);
  if (!snapshot) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  return jsonPrivateNoStore({
    game:
      auth.kind === "student"
        ? sanitizeGameSnapshotForStudent(snapshot, auth.studentId)
        : snapshot,
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { gameId } = await params;
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { boardId: true },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(game.boardId);
  if (
    auth.kind !== "teacher" ||
    (auth.role !== "owner" && auth.role !== "editor")
  ) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await commandSpeedGameRun({
      gameId,
      runId: parsed.data.runId,
      requestId: parsed.data.requestId,
      expectedVersion: parsed.data.expectedVersion,
      action: parsed.data.action,
      actorSubject: `teacher:${auth.userId}`,
    });
    if (!result.replayed) {
      scheduleSpeedGameChange(gameId, parsed.data.action);
    }
    return jsonPrivateNoStore(result);
  } catch (error) {
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
    console.error("[PATCH /api/speed-game/games/:gameId]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
