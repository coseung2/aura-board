/**
 * POST /api/share/qr  { boardId }
 *
 * Teacher-only. Returns SVG string for the current share URL.
 */
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const boardId = (raw as { boardId?: unknown })?.boardId;
  if (typeof boardId !== "string")
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    await requirePermission(boardId, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { shareMode: true, shareToken: true },
  });
  if (!board)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (board.shareMode !== "view" || !board.shareToken) {
    return NextResponse.json({ error: "not_shared" }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "";
  const url = `${origin}/share/${board.shareToken}`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 256,
  });
  return NextResponse.json({ ok: true, url, svg });
}
