/**
 * POST /api/boards/[id]/share/rotate
 *
 * shareToken 만 갱신. shareMode 는 유지.
 * Teacher-only.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/auth";
import { issueShareToken, issueShortCode } from "@/lib/share/tokens";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await requirePermission(id, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }

  const board = await db.board.findUnique({
    where: { id },
    select: { shareMode: true, shareToken: true },
  });
  if (!board) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (board.shareMode === "private") {
    return NextResponse.json(
      { error: "sharing_not_enabled" },
      { status: 400 }
    );
  }

  const updated = await db.board.update({
    where: { id },
    data: {
      shareToken: issueShareToken(),
      shareShortCode: issueShortCode(),
    },
    select: { id: true, slug: true, shareMode: true, shareToken: true, shareShortCode: true },
  });

  const origin = req.headers.get("origin") || "";
  const shareUrl = `${origin}/share/${updated.shareToken}`;
  const shortUrl = updated.shareShortCode
    ? `${origin}/s/${updated.shareShortCode}`
    : null;

  return NextResponse.json({
    ok: true,
    shareMode: updated.shareMode,
    shareToken: updated.shareToken,
    shareUrl,
    shareShortCode: updated.shareShortCode,
    shortUrl,
  });
}
