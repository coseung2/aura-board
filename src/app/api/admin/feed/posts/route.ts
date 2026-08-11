import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { createFeedPost } from "@/lib/feed/repository";
import {
  adminFeedPostInputSchema,
  normalizeFeedMedia,
} from "@/lib/feed/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = adminFeedPostInputSchema.safeParse(body);
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

  const isPublished = parsed.data.publishGlobal || parsed.data.addToPool;
  const created = await createFeedPost({
    actor: {
      kind: "PLATFORM",
      displayName: "Aura 공식",
      userId: user.id,
    },
    title: parsed.data.title,
    body: parsed.data.body,
    media,
    status: isPublished ? "PUBLISHED" : "DRAFT",
    publication: parsed.data.publishGlobal
      ? {
          scope: "GLOBAL",
          publishedByUserId: user.id,
        }
      : null,
    poolCreatedByUserId: parsed.data.addToPool ? user.id : null,
  });

  await logAudit({
    actorType: "admin",
    actorId: user.id,
    action: "feed.post.create",
    resourceType: "feed_post",
    resourceId: created.postId,
    metadata: {
      addToPool: parsed.data.addToPool,
      publishGlobal: parsed.data.publishGlobal,
    },
    req,
  });

  return NextResponse.json(created, { status: 201 });
}
