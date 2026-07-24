import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";

// GET /api/boards/:id/queue/ranking
// Returns top-10 played songs + top-10 submitters for the current calendar
// month (server local time). Counts only songs that were actually played:
// queueStatus="played" AND updatedAt within [firstOfMonth, now].
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: boardIdOrSlug } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true, anonymousAuthor: true },
  });
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

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Played songs this month — only actual plays.
  const playedThisMonth = await db.card.findMany({
    where: {
      boardId: board.id,
      queueStatus: "played",
      updatedAt: { gte: firstOfMonth },
    },
    select: {
      linkUrl: true,
      linkImage: true,
      title: true,
      studentAuthorId: true,
      externalAuthorName: true,
      authorId: true,
      author: { select: { name: true } },
    },
  });

  const songMap = new Map<
    string,
    { linkUrl: string; linkImage: string | null; title: string; count: number }
  >();
  const submitterMap = new Map<
    string,
    { key: string; name: string; count: number; isStudent: boolean }
  >();

  for (const card of playedThisMonth) {
    if (card.linkUrl) {
      const song = songMap.get(card.linkUrl);
      if (song) song.count += 1;
      else
        songMap.set(card.linkUrl, {
          linkUrl: card.linkUrl,
          linkImage: card.linkImage,
          title: card.title,
          count: 1,
        });
    }

    const isStudent = !!card.studentAuthorId;
    const key = isStudent ? `s:${card.studentAuthorId}` : `u:${card.authorId}`;
    const name = isStudent
      ? card.externalAuthorName ?? "학생"
      : card.author?.name ?? "선생님";
    const submitter = submitterMap.get(key);
    if (submitter) submitter.count += 1;
    else submitterMap.set(key, { key, name, count: 1, isStudent });
  }

  const songs = [...songMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const submitters = board.anonymousAuthor
    ? []
    : [...submitterMap.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

  return NextResponse.json({
    songs,
    submitters,
    submittersHidden: board.anonymousAuthor,
  });
}
