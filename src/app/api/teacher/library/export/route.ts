import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { limitCanvaExport } from "@/lib/rate-limit-routes";
import {
  buildTeacherLibraryPdf,
  TeacherLibraryPdfError,
} from "@/lib/teacher-library-pdf";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(20),
  filename: z.string().trim().min(1).max(100).default("수업 자료"),
  layout: z.enum(["a4-auto", "a4-fit", "original"]).default("a4-auto"),
});

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonPrivateNoStore({ error: "bad_request" }, { status: 400 });
  if (new Set(parsed.data.itemIds).size !== parsed.data.itemIds.length) {
    return jsonPrivateNoStore({ error: "duplicate_items" }, { status: 400 });
  }

  const rateLimit = await limitCanvaExport(user.id);
  if (!rateLimit.ok) {
    return jsonPrivateNoStore(
      { error: "rate_limited", retryAfter: rateLimit.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
    );
  }

  const rows = await db.teacherLibraryItem.findMany({
    where: { userId: user.id, id: { in: parsed.data.itemIds } },
    select: { id: true, kind: true, assetUrl: true, canvaDesignId: true },
  });
  if (rows.length !== parsed.data.itemIds.length) {
    return jsonPrivateNoStore({ error: "library_item_not_found" }, { status: 404 });
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = parsed.data.itemIds.map((id) => byId.get(id)!);

  try {
    const bytes = await buildTeacherLibraryPdf({
      userId: user.id,
      items: ordered,
      baseUrl: request.url,
      layout: parsed.data.layout,
    });
    const safeAscii = parsed.data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_") || "aura-library";
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeAscii}.pdf"; filename*=UTF-8''${encodeURIComponent(parsed.data.filename)}.pdf`,
      },
    });
  } catch (error) {
    if (error instanceof TeacherLibraryPdfError) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[POST /api/teacher/library/export]", error);
    return jsonPrivateNoStore({ error: "library_export_failed" }, { status: 500 });
  }
}
