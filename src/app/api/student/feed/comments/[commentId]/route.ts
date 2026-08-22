import { NextResponse } from "next/server";
import { getCurrentFeedViewer } from "@/lib/feed/repository";
import { deleteFeedComment } from "@/lib/feed/engagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const viewer = await getCurrentFeedViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { commentId } = await params;
  const result = await deleteFeedComment(commentId, viewer);
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
