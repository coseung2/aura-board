import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { extractVideoId, fetchYouTubeMeta, canonicalUrl } from "@/lib/youtube";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import {
  DJ_REQUEST_LIMIT_ERROR,
  DJ_REQUEST_LIMIT_PER_HOUR,
  buildDjRequestLimitWhere,
  getDjRequestLimitLockKey,
  getDjRequestWindowStart,
} from "@/lib/dj-request-limit";

const SubmitBody = z.object({
  youtubeUrl: z.string().min(1),
  note: z.string().max(200).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: boardIdOrSlug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SubmitBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "youtubeUrl 필수" }, { status: 400 });
  }

  // Resolve identity. At least one of user/student required + must be in the
  // board's classroom. Teacher session wins — if the teacher's browser has
  // a stale student cookie (common during classroom testing), ignore it so
  // the submission isn't mis-attributed to that student. `actingStudent` is
  // the student-identity signal used downstream for both permission resolve
  // and author stamping.
  const [user, rawStudent] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  const actingStudent = user ? null : rawStudent;
  if (!user && !actingStudent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const student = actingStudent;

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: {
      id: true,
      layout: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (board.layout !== "dj-queue") {
    return NextResponse.json(
      { error: "DJ 큐 보드가 아닙니다" },
      { status: 400 },
    );
  }
  if (!board.classroomId || !board.classroom) {
    return NextResponse.json(
      { error: "DJ 보드는 학급에 속해야 합니다" },
      { status: 400 },
    );
  }

  // Any classroom member can submit. Teacher passes via user path.
  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const windowStart = getDjRequestWindowStart();
  const requestLimitWhere = buildDjRequestLimitWhere({
    boardId: board.id,
    userId: user?.id,
    studentId: student?.id,
    windowStart,
  });
  const recentRequestCount = await db.card.count({
    where: requestLimitWhere,
  });
  if (recentRequestCount >= DJ_REQUEST_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: DJ_REQUEST_LIMIT_ERROR },
      { status: 429 },
    );
  }

  // Validate YouTube URL + fetch oEmbed.
  const videoId = extractVideoId(parsed.data.youtubeUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: "YouTube 링크만 신청할 수 있어요" },
      { status: 400 },
    );
  }
  const meta = await fetchYouTubeMeta(videoId);
  if (!meta) {
    return NextResponse.json(
      { error: "재생할 수 없는 영상이에요 (비공개/삭제)" },
      { status: 400 },
    );
  }

  // authorId: teacher if user is teacher, else classroom teacher (for
  // student-authored cards). studentAuthor* captures the student identity.
  const authorId = user?.id ?? board.classroom.teacherId;
  const lockKey = getDjRequestLimitLockKey({
    boardId: board.id,
    userId: user?.id,
    studentId: student?.id,
  });

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dj-request-limit'), hashtext(${lockKey}))`;

    const guardedCount = await tx.card.count({
      where: buildDjRequestLimitWhere({
        boardId: board.id,
        userId: user?.id,
        studentId: student?.id,
        windowStart: getDjRequestWindowStart(),
      }),
    });
    if (guardedCount >= DJ_REQUEST_LIMIT_PER_HOUR) {
      return { limited: true as const };
    }

    const last = await tx.card.findFirst({
      where: { boardId: board.id, queueStatus: { not: null } },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? 0) + 1;

    const card = await tx.card.create({
      data: {
        boardId: board.id,
        authorId,
        title: meta.title,
        content: parsed.data.note ?? "",
        linkUrl: meta.canonicalUrl,
        linkTitle: meta.title,
        linkImage: meta.thumbnailUrl,
        linkDesc: meta.authorName,
        videoUrl: meta.canonicalUrl,
        studentAuthorId: student?.id ?? null,
        externalAuthorName: student?.name ?? null,
        order: nextOrder,
        queueStatus: "pending",
      },
    });

    return { limited: false as const, card };
  });
  if (result.limited) {
    return NextResponse.json(
      { error: DJ_REQUEST_LIMIT_ERROR },
      { status: 429 },
    );
  }

  // classroom-boards-tab "🟢 새 활동" 배지 — DJ 큐 신청도 카드 생성 → board touch.
  await touchBoardUpdatedAt(board.id);

  return NextResponse.json({ card: result.card });
}
