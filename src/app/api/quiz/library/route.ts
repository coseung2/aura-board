import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import type { QuizLibraryItem } from "@/types/quiz";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(req: Request) {
  const ids = await resolveIdentities();
  if (!ids.teacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_LIMIT;

  const ownedBoardIds = Array.from(ids.teacher.ownsBoardIds);
  if (ownedBoardIds.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const quizzes = await db.quiz.findMany({
    where: { boardId: { in: ownedBoardIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      createdAt: true,
      difficulty: true,
      boardId: true,
      _count: { select: { questions: true } },
    },
  });

  const hasMore = quizzes.length > limit;
  const page = hasMore ? quizzes.slice(0, limit) : quizzes;

  const items: QuizLibraryItem[] = page.map((q) => ({
    id: q.id,
    title: q.title,
    createdAt: q.createdAt.toISOString(),
    difficulty: (q.difficulty as QuizLibraryItem["difficulty"]) ?? null,
    boardId: q.boardId,
    questionCount: q._count.questions,
  }));

  return NextResponse.json({
    items,
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
