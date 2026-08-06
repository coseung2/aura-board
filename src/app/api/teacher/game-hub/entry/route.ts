import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { OFFICIAL_GAME_KINDS } from "@/lib/game-platform/contracts";
import { resolveOrCreateCanonicalGameRoom } from "@/lib/game-platform/hub-room";

const entrySchema = z
  .object({
    gameKind: z.enum(OFFICIAL_GAME_KINDS),
    classroomId: z.string().min(1).max(120),
  })
  .strict();

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "invalid_game_hub_entry" },
      { status: 400 },
    );
  }

  const classroom = await db.classroom.findFirst({
    where: {
      id: parsed.data.classroomId,
      teacherId: user.id,
    },
    select: { id: true },
  });
  if (!classroom) {
    return jsonPrivateNoStore({ error: "classroom_not_found" }, { status: 404 });
  }

  try {
    const room = await resolveOrCreateCanonicalGameRoom(
      { id: user.id, classroomId: classroom.id },
      parsed.data.gameKind,
    );
    return jsonPrivateNoStore({
      gameKind: parsed.data.gameKind,
      boardId: room.id,
      boardSlug: room.slug,
      href: `/board/${encodeURIComponent(room.slug)}`,
    });
  } catch (error) {
    console.error("[POST /api/teacher/game-hub/entry]", error);
    return jsonPrivateNoStore({ error: "entry_unavailable" }, { status: 503 });
  }
}
