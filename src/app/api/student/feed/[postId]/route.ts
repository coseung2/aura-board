import { NextResponse } from "next/server";
import { getCurrentFeedViewer, deleteFeedPost, updateStudentFeedPost } from "@/lib/feed/repository";
import { feedPostInputSchema, normalizeFeedMedia } from "@/lib/feed/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { withProductFeature } from "@/lib/product-release-server";

export const DELETE = withProductFeature("feed", DELETEHandler);
async function DELETEHandler(
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

export const PATCH = withProductFeature("feed", PATCHHandler);
async function PATCHHandler(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const viewer = await getCurrentFeedViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

  const { postId } = await params;
  const result = await updateStudentFeedPost(postId, viewer, {
    title: parsed.data.title,
    body: parsed.data.body,
    media,
  });
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, postId });
}
