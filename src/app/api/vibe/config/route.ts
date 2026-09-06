// Vibe-arcade config API (Seed 13, AC-F1).
// GET: board member (교사) 또는 학급 학생 읽기 허용.
// PATCH: 교사(owner/editor) 만.
//
// 2026-04-22 student 400 fix: 기존에 getCurrentUser() 만 체크해서 학생이
// GET 호출하면 500/401 → VibeArcadeBoard가 영원히 loading 상태로 멈춤.
// 학생 세션도 허용하도록 확장.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import { VibeArcadeConfigPatchSchema } from "@/lib/vibe-arcade/types";

function boardIdFromReq(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("boardId");
}

async function ensureConfig(boardId: string) {
  const existing = await db.vibeArcadeConfig.findUnique({ where: { boardId } });
  if (existing) return existing;
  return db.vibeArcadeConfig.create({ data: { boardId } });
}

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(req: Request) {
  const boardId = boardIdFromReq(req);
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  // NextAuth 세션 또는 학생 세션 중 하나는 필수.
  const user = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent().catch(() => null);
  if (!user && !student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { classroomId: true },
  });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Scope check.
  // - 학생: 자기 학급 보드만.
  // - 교사: BoardMember 여야 (getBoardRole).
  if (student && (!board.classroomId || board.classroomId !== student.classroomId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user && !student) {
    const role = await getBoardRole(boardId, user.id);
    if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cfg = await ensureConfig(boardId);
  return NextResponse.json(cfg);
}

export const PATCH = withProductFeature("developmentLayouts", PATCHHandler);
async function PATCHHandler(req: Request) {
  const boardId = boardIdFromReq(req);
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getBoardRole(boardId, user.id);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = VibeArcadeConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureConfig(boardId);
  const updated = await db.vibeArcadeConfig.update({
    where: { boardId },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}
