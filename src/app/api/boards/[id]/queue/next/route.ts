// DJ 큐 다음 곡 조회 — provider 레벨 auto-advance 용 (PiP 상태).
// GET /api/boards/:id/queue/next
// 응답: { card: DJ queue card | null } — PiP 클라이언트는 일부 필드만 사용한다.
//
// 권한: 교사 or 학생 (자기 학급). DJ 보드가 DJBoard 컴포넌트로 마운트되어
// 있으면 SSE snapshot 으로 이미 클라이언트에 cards 가 있으므로 이 엔드포인트
// 는 안 쓰고, 언마운트 상태(PiP) 에서만 호출된다.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { resolveCardAuthorLabels } from "@/lib/card-author-labels";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: boardIdOrSlug } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true, classroomId: true, anonymousAuthor: true },
  });
  if (!board) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 접근 권한 — 학생: 자기 학급 / 교사: getEffectiveBoardRole.
  if (student) {
    if (board.classroomId !== student.classroomId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (user) {
    const role = await getEffectiveBoardRole(board.id, { userId: user.id });
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const card = await db.card.findFirst({
    where: { boardId: board.id, queueStatus: "approved" },
    orderBy: { order: "asc" },
    select: {
      id: true,
      boardId: true,
      authorId: true,
      studentAuthorId: true,
      externalAuthorName: true,
      title: true,
      videoUrl: true,
      linkUrl: true,
      linkImage: true,
      queueStatus: true,
    },
  });

  if (!card) {
    return NextResponse.json({ card: null });
  }

  const authorLabels = await resolveCardAuthorLabels(card);

  return NextResponse.json({
    card: {
      ...card,
      ...authorLabels,
      anonymousAuthor: board.anonymousAuthor,
    },
  });
}
