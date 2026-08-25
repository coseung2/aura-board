import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { ForbiddenError, requirePermission } from "@/lib/rbac";
import {
  importSectionIntoTeacherLibrary,
  TeacherLibraryError,
} from "@/lib/teacher-library";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({ sectionId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonPrivateNoStore({ error: "bad_request" }, { status: 400 });
  }

  try {
    const section = await db.section.findUnique({
      where: { id: parsed.data.sectionId },
      select: { boardId: true },
    });
    if (!section) return jsonPrivateNoStore({ error: "section_not_found" }, { status: 404 });
    await requirePermission(section.boardId, user.id, "edit");
    const result = await importSectionIntoTeacherLibrary({
      userId: user.id,
      sectionId: parsed.data.sectionId,
    });
    console.info("[teacher-library-import]", {
      sectionId: parsed.data.sectionId,
      created: result.created,
      reused: result.reused,
      failed: result.failed,
      ...result.timing,
    });
    return jsonPrivateNoStore(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof TeacherLibraryError) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[POST /api/teacher/library/import-section]", error);
    return jsonPrivateNoStore({ error: "library_import_failed" }, { status: 500 });
  }
}
