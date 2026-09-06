// Vibe-arcade quota status (Seed 13, AC-F12 tab2).
// GET: teacher-only. Returns today's classroom + per-student token usage.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";
import { getClassroomQuotaToday } from "@/lib/vibe-arcade/quota-ledger";

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await getBoardRole(boardId, user.id);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board || !board.classroomId) {
    return NextResponse.json({ error: "board_not_classroom_scoped" }, { status: 400 });
  }

  const cfg = await db.vibeArcadeConfig.findUnique({ where: { boardId } });
  const pool = cfg?.classroomDailyTokenPool ?? 1_500_000;

  const { used, byStudent } = await getClassroomQuotaToday(board.classroomId);
  return NextResponse.json({ pool, used, byStudent });
}
