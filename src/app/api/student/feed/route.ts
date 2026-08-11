import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { createFeedPost, listPublishedFeed } from "@/lib/feed/repository";
import {
  decodeFeedCursor,
  feedListQuerySchema,
  feedPostInputSchema,
  normalizeFeedMedia,
} from "@/lib/feed/validation";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
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

  const page = await listPublishedFeed({
    scope: parsed.data.scope === "global" ? "GLOBAL" : "CLASSROOM",
    classroomId: parsed.data.scope === "classroom" ? student.classroomId : null,
    limit: parsed.data.limit,
    cursor,
  });

  return NextResponse.json(page);
}

export async function POST(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = feedPostInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let media;
  try {
    media = normalizeFeedMedia(parsed.data.media);
  } catch {
    return NextResponse.json({ error: "invalid_media" }, { status: 400 });
  }

  const created = await createFeedPost({
    actor: {
      kind: "STUDENT",
      displayName: student.name,
      studentId: student.id,
    },
    title: parsed.data.title,
    body: parsed.data.body,
    media,
    publication: {
      scope: "CLASSROOM",
      classroomId: student.classroomId,
      publishedByStudentId: student.id,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
