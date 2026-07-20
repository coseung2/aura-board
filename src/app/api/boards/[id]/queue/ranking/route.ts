import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";

// GET /api/boards/:id/queue/ranking
// Returns top-10 played songs + top-10 submitters for the current calendar
// month (server local time). "Played" = queueStatus="played" AND updatedAt
// within [firstOfMonth, now].
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

  // Played songs this month — grouped by linkUrl, counted.
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
    },
  });

  const songMap = new Map<
    string,
    { linkUrl: string; linkImage: string | null; title: string; count: number }
  >();
  for (const c of playedThisMonth) {
    if (!c.linkUrl) continue;
    const entry = songMap.get(c.linkUrl);
    if (entry) entry.count += 1;
    else
      songMap.set(c.linkUrl, {
        linkUrl: c.linkUrl,
        linkImage: c.linkImage,
        title: c.title,
        count: 1,
      });
  }
  const songs = [...songMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Submissions this month — grouped by submitter identity.
  const submittedThisMonth = await db.card.findMany({
    where: {
      boardId: board.id,
      queueStatus: { not: null },
      createdAt: { gte: firstOfMonth },
    },
    select: {
      studentAuthorId: true,
      externalAuthorName: true,
      authorId: true,
      author: { select: { name: true } },
    },
  });

  const submitterMap = new Map<
    string,
    { key: string; name: string; count: number; isStudent: boolean }
  >();
  for (const c of submittedThisMonth) {
    // Student submitter → key by studentAuthorId, name from externalAuthorName.
    // Teacher submitter → key by authorId, name from author.name.
    const isStudent = !!c.studentAuthorId;
    const key = isStudent ? `s:${c.studentAuthorId}` : `u:${c.authorId}`;
    const name = isStudent
      ? c.externalAuthorName ?? "학생"
      : c.author?.name ?? "선생님";
    const entry = submitterMap.get(key);
    if (entry) entry.count += 1;
    else submitterMap.set(key, { key, name, count: 1, isStudent });
  }
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
