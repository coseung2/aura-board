// Vibe-arcade projects API (Seed 13, AC-F2 / AC-F10).
// GET: catalog query (board members / classroom-scoped).
// POST: student saves the artifact from a Sonnet session.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import { scheduleRealtimePublish } from "@/lib/realtime-server";
import { VibeProjectCreateSchema } from "@/lib/vibe-arcade/types";
import { scanHtml } from "@/lib/vibe-arcade/moderation-filter";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const tab = url.searchParams.get("tab") ?? "new"; // new|popular|friend|to-review
  const tag = url.searchParams.get("tag");
  const take = Math.min(Number(url.searchParams.get("take") ?? 30), 60);

  const user = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent().catch(() => null);
  if (!user && !student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Scope check — student viewers limited to their own classroom's board.
  // Teacher/owner rely on NextAuth board membership.
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { classroomId: true },
  });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (student && board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user && !student) {
    const role = await getBoardRole(boardId, user.id);
    if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Only approved projects are catalog-visible (except for the author / teacher).
  const orderBy =
    tab === "popular"
      ? [{ playCount: "desc" as const }, { createdAt: "desc" as const }]
      : tab === "to-review"
        ? [{ reviewCount: "asc" as const }, { createdAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

  const where: Record<string, unknown> = {
    boardId,
    moderationStatus: "approved",
  };
  if (tag) where.tags = { contains: tag };

  const items = await db.vibeProject.findMany({
    where,
    orderBy,
    take,
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      tags: true,
      playCount: true,
      reviewCount: true,
      ratingAvg: true,
      authorStudentId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = VibeProjectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Must own the session.
  const session = await db.vibeSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.studentId !== student.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // HTML/CSS/JS filter (AC-G2 / AC-G3). 3-tab split 이후 세 필드 모두 스캔 — 어느
  // 한 필드라도 위험 패턴이 있으면 거부한다 (CSS expression()/url(javascript:),
  // JS eval/fetch-outside-allowlist 등이 독립적으로 유입될 수 있음).
  const combinedForScan = [
    input.htmlContent,
    input.cssContent ? `<style>${input.cssContent}</style>` : "",
    input.jsContent ? `<script>${input.jsContent}</script>` : "",
  ].join("\n");
  const scan = scanHtml(combinedForScan);
  if (!scan.pass) {
    return NextResponse.json(
      { error: "moderation_failed", hits: scan.hits },
      { status: 400 },
    );
  }

  // Resolve classroomId via board (Student.classroomId already available).
  const board = await db.board.findUnique({ where: { id: input.boardId } });
  if (!board || board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cfg = await db.vibeArcadeConfig.findUnique({ where: { boardId: input.boardId } });
  const initialStatus =
    cfg?.moderationPolicy === "auto_publish" ? "approved" : "pending_review";

  const project = await db.vibeProject.create({
    data: {
      boardId: input.boardId,
      classroomId: student.classroomId,
      authorStudentId: student.id,
      title: input.title,
      description: input.description,
      htmlContent: input.htmlContent,
      cssContent: input.cssContent,
      jsContent: input.jsContent,
      tags: JSON.stringify(input.tags),
      moderationStatus: initialStatus,
    },
  });

  // Link session to project.
  await db.vibeSession.update({
    where: { id: input.sessionId },
    data: { projectId: project.id, status: "completed", endedAt: new Date() },
  });

  scheduleRealtimePublish({
    channel: `board:${input.boardId}:vibe-arcade`,
    type: "project.created",
    payload: { projectId: project.id, boardId: input.boardId },
  });

  return NextResponse.json({ id: project.id, moderationStatus: project.moderationStatus });
}
