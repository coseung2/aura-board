import { z } from "zod";
import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { OFFICIAL_GAME_KINDS } from "@/lib/game-platform/contracts";
import { resolveOrCreateCanonicalGameRoom } from "@/lib/game-platform/hub-room";

const entrySchema = z
  .object({
    gameKind: z.enum(OFFICIAL_GAME_KINDS),
  })
  .strict();

export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "invalid_game_hub_entry" },
      { status: 400 },
    );
  }

  try {
    const room = await resolveOrCreateCanonicalGameRoom(
      { id: student.id, classroomId: student.classroomId },
      parsed.data.gameKind,
    );
    return jsonPrivateNoStore({
      gameKind: parsed.data.gameKind,
      boardId: room.id,
      boardSlug: room.slug,
      href: `/board/${encodeURIComponent(room.slug)}?view=student`,
    });
  } catch (error) {
    console.error("[POST /api/student/game-hub/entry]", error);
    return jsonPrivateNoStore({ error: "entry_unavailable" }, { status: 503 });
  }
}
