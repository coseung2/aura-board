import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listPublishedFeed } from "@/lib/feed/repository";
import { decodeFeedCursor, feedListQuerySchema } from "@/lib/feed/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = feedListQuerySchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const cursor = decodeFeedCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) {
    return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
  }

  let classroomId: string | null = null;
  if (parsed.data.scope === "classroom") {
    classroomId = url.searchParams.get("classroomId")?.trim() || null;
    if (!classroomId) {
      return NextResponse.json({ error: "classroom_required" }, { status: 400 });
    }

    const classroom = await db.classroom.findFirst({
      where: { id: classroomId, teacherId: user.id },
      select: { id: true },
    });
    if (!classroom) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const page = await listPublishedFeed({
    scope: parsed.data.scope === "global" ? "GLOBAL" : "CLASSROOM",
    classroomId,
    limit: parsed.data.limit,
    cursor,
  });

  return NextResponse.json(page);
}
