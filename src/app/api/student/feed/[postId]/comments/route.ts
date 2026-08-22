import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCurrentFeedViewer,
} from "@/lib/feed/repository";
import { createFeedComment, listFeedComments } from "@/lib/feed/engagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CommentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  parentCommentId: z.string().trim().min(1).max(191).nullable().optional(),
});

async function auth() {
  const viewer = await getCurrentFeedViewer();
  return viewer;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const viewer = await auth();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { postId } = await params;
  const result = await listFeedComments(postId, viewer);
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const viewer = await auth();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { postId } = await params;
  const created = await createFeedComment({ postId, viewer, ...parsed.data });
  if (created === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (created === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (created === "reply_target_not_found") {
    return NextResponse.json({ error: "reply_target_not_found" }, { status: 404 });
  }
  if (created === "invalid") return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const page = await listFeedComments(postId, viewer);
  const item = page?.items.flatMap((root) => [root, ...root.replies]).find((row) => row.id === created.id);
  return NextResponse.json({ item }, { status: 201 });
}
