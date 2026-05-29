/**
 * POST /api/boards/[id]/share  { mode: "view" | "private" }
 *   — shareMode 를 설정. "view" 면 shareToken 자동 발급, "private" 면 shareToken 삭제.
 *
 * POST /api/boards/[id]/share/rotate
 *   — shareToken 만 갱신 (기존 QR/링크 무효화). shareMode 는 유지.
 *
 * Teacher-only. Returns { ok, shareMode, shareToken, shareUrl }.
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const mode = (raw as { mode?: unknown })?.mode;
  if (mode !== "view" && mode !== "comment" && mode !== "edit" && mode !== "private") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }

  const board = await db.board.update({
    where: { id },
    data: {
      shareMode: mode,
      shareToken: mode !== "private" ? issueShareToken() : null,
      shareShortCode: mode !== "private" ? issueShortCode() : null,
    },
    select: { id: true, slug: true, shareMode: true, shareToken: true, shareShortCode: true },
  });

  const origin = req.headers.get("origin") || "";
  const shareUrl = board.shareToken
    ? `${origin}/share/${board.shareToken}`
    : null;
  const shortUrl = board.shareShortCode
    ? `${origin}/s/${board.shareShortCode}`
    : null;

  return NextResponse.json({
    ok: true,
    shareMode: board.shareMode,
    shareToken: board.shareToken,
    shareUrl,
    shareShortCode: board.shareShortCode,
    shortUrl,
  });
}
