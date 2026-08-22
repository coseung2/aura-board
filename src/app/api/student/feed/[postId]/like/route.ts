import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCurrentFeedViewer,
  toggleFeedPostLike,
} from "@/lib/feed/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LikeSchema = z.object({ liked: z.boolean().optional() }).passthrough();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const viewer = await getCurrentFeedViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { postId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = LikeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const result = await toggleFeedPostLike({
    postId,
    viewer,
    desiredLiked: parsed.data.liked,
  });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(result);
}
