import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceQuestionChange } from "@/lib/realtime-broadcast";

const CreateBody = z.object({
  text: z.string().min(1).max(500),
});

async function resolveBoard(boardIdOrSlug: string) {
  return db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true, layout: true },
  });
}

// POST: 학생 또는 교사가 응답 1건 생성.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: boardIdOrSlug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "text 필수" }, { status: 400 });
  }

  const [user, rawStudent] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  // 교사 세션이 있으면 우선. stale student 쿠키 섞임 방지 (dj-queue 와 동일 패턴).
  const actingStudent = user ? null : rawStudent;
  if (!user && !actingStudent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await resolveBoard(boardIdOrSlug);
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (board.layout !== "question-board") {
    return NextResponse.json({ error: "Layout mismatch" }, { status: 400 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: actingStudent?.id,
  });
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response = await db.boardResponse.create({
    data: {
      boardId: board.id,
      studentId: actingStudent?.id ?? null,
      userId: user?.id ?? null,
      text: parsed.data.text.trim(),
    },
  });

  // stream route 의 poll 이 board.updatedAt 변화를 감지해 snapshot 재전송.
  await touchBoardUpdatedAt(board.id);
  void announceQuestionChange(board.id, "response_insert", response.id);

  return NextResponse.json({ response });
}

// GET: 응답 목록 반환 (시간 내림차순, 최대 200).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: boardIdOrSlug } = await params;
  const limitRaw = new URL(req.url).searchParams.get("limit");
  const limit = Math.max(1, Math.min(500, Number(limitRaw) || 200));

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await resolveBoard(boardIdOrSlug);
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const responses = await db.boardResponse.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      student: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    responses: responses.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      studentId: r.studentId,
      userId: r.userId,
      authorName: r.student?.name ?? r.user?.name ?? "익명",
    })),
  });
}
