import { NextResponse } from "next/server";
import { getCurrentFeedViewer, deleteFeedPost } from "@/lib/feed/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const viewer = await getCurrentFeedViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { postId } = await params;
  const result = await deleteFeedPost(postId, viewer);
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, status: result });
}
