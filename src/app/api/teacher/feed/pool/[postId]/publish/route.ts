import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { publishPoolPostToClassrooms } from "@/lib/feed/repository";
import { publishPoolPostInputSchema } from "@/lib/feed/validation";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = publishPoolPostInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const classroomIds = [...new Set(parsed.data.classroomIds)];
  const ownedClassrooms = await db.classroom.findMany({
    where: {
      id: { in: classroomIds },
      teacherId: user.id,
    },
    select: { id: true },
  });
  if (ownedClassrooms.length !== classroomIds.length) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { postId } = await params;
  const result = await publishPoolPostToClassrooms({
    postId,
    classroomIds,
    publishedByUserId: user.id,
  });
  if (!result.found) {
    return NextResponse.json({ error: "pool_post_not_found" }, { status: 404 });
  }

  await logAudit({
    actorType: "teacher",
    actorId: user.id,
    action: "feed.pool.publish_to_classrooms",
    resourceType: "feed_post",
    resourceId: postId,
    metadata: { classroomIds },
  });

  return NextResponse.json({ ok: true, published: result.published });
}
