import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createFeedPost } from "@/lib/feed/repository";
import {
  normalizeFeedMedia,
  teacherFeedPostInputSchema,
} from "@/lib/feed/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = teacherFeedPostInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const classroom = await db.classroom.findUnique({
    where: { id: parsed.data.classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let media;
  try {
    media = normalizeFeedMedia(parsed.data.media);
  } catch {
    return NextResponse.json({ error: "invalid_media" }, { status: 400 });
  }

  const created = await createFeedPost({
    actor: {
      kind: "TEACHER",
      displayName: user.name?.trim() || user.email,
      userId: user.id,
    },
    title: parsed.data.title,
    body: parsed.data.body,
    media,
    publication: {
      scope: "CLASSROOM",
      classroomId: classroom.id,
      publishedByUserId: user.id,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
