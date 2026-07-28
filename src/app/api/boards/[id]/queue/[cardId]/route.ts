import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { resolveCardAuthorLabels } from "@/lib/card-author-labels";
import { announceQueueChange } from "@/lib/realtime-broadcast";

const PatchBody = z.object({
  status: z.enum(["approved", "rejected", "played"]),
});

async function resolveBoard(idOrSlug: string) {
  return db.board.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, layout: true, classroomId: true, anonymousAuthor: true },
  });
}

/** YouTube URL 에서 11자 videoId 추출. 같은 곡 집계 join key. */
function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  const m2 = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m2) return m2[1];
  const m3 = url.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m3) return m3[1];
  return null;
}

async function resolveIdentity() {
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  return { user, student };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const { id: boardIdOrSlug, cardId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status 필수" }, { status: 400 });
  }

  const { user, student } = await resolveIdentity();
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
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card || card.boardId !== board.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (card.queueStatus === null) {
    return NextResponse.json(
      { error: "큐 항목이 아닙니다" },
      { status: 400 }
    );
  }

  let updated;
  if (parsed.data.status === "played") {
    if (card.queueStatus === "played") {
      return NextResponse.json(
        { error: "이미 재생 처리된 큐 항목입니다" },
        { status: 409 }
      );
    }

    const previousQueueStatus = card.queueStatus;
    updated = await db.$transaction(async (tx) => {
      // Read-then-update alone lets two DJs both observe the same old status.
      // Claim this exact transition atomically; only the claimant may append
      // the recap/ranking event below.
      const claimed = await tx.card.updateMany({
        where: {
          id: cardId,
          boardId: board.id,
          queueStatus: previousQueueStatus,
        },
        data: { queueStatus: "played" },
      });
      if (claimed.count !== 1) return null;

      // dj-recap (2026-04-22): Card.queueStatus 는 UI 상태용,
      // DjPlayEvent 는 월말 리캡/랭킹 영구 로그. 둘은 함께 commit/rollback 한다.
      // played → approved 후 다시 played 되면 새 전이이므로 이벤트도 새로 기록.
      if (board.classroomId) {
        const submitterName =
          card.externalAuthorName ??
          (await resolveSubmitterName(
            card.studentAuthorId,
            card.authorId,
            tx
          ));
        const submitterKind: "student" | "teacher" | "anon" = card.studentAuthorId
          ? "student"
          : card.authorId
            ? "teacher"
            : "anon";
        await tx.djPlayEvent.create({
          data: {
            boardId: board.id,
            classroomId: board.classroomId,
            cardId: card.id,
            title: card.title,
            linkUrl: card.linkUrl ?? null,
            linkImage: card.linkImage ?? null,
            videoId: extractVideoId(card.videoUrl ?? card.linkUrl),
            submitterName: submitterName ?? null,
            submitterId: card.studentAuthorId ?? card.authorId ?? null,
            submitterKind,
            // durationSec 은 YouTube oEmbed 결과가 지금 Card 에 안 저장돼 있음.
            durationSec: null,
          },
        });
      }

      return tx.card.findUniqueOrThrow({ where: { id: cardId } });
    });

    if (!updated) {
      return NextResponse.json(
        { error: "큐 항목 상태가 이미 변경되었습니다" },
        { status: 409 }
      );
    }
  } else {
    // 승인/거절 전이는 기존 API 의미를 유지한다.
    updated = await db.card.update({
      where: { id: cardId },
      data: { queueStatus: parsed.data.status },
    });
  }

  // classroom-boards-tab "🟢 새 활동" 배지 — 큐 상태 변경도 활동 신호.
  await touchBoardUpdatedAt(board.id);
  void announceQueueChange(board.id, cardId, "status");
  const authorLabels = await resolveCardAuthorLabels(updated);

  return NextResponse.json({
    card: {
      ...updated,
      ...authorLabels,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      anonymousAuthor: board.anonymousAuthor,
    },
  });
}

async function resolveSubmitterName(
  studentAuthorId: string | null,
  authorId: string | null,
  client: Pick<Prisma.TransactionClient, "student" | "user"> = db,
): Promise<string | null> {
  if (studentAuthorId) {
    const s = await client.student.findUnique({
      where: { id: studentAuthorId },
      select: { name: true },
    });
    return s?.name ?? null;
  }
  if (authorId) {
    const u = await client.user.findUnique({
      where: { id: authorId },
      select: { name: true },
    });
    return u?.name ?? null;
  }
  return null;
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const { id: boardIdOrSlug, cardId } = await params;

  const { user, student } = await resolveIdentity();
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await resolveBoard(boardIdOrSlug);
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card || card.boardId !== board.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });

  const isDJOrTeacher = role === "owner" || role === "editor";
  const isOwnPending =
    card.queueStatus === "pending" &&
    student !== null &&
    card.studentAuthorId === student.id;

  if (!isDJOrTeacher && !isOwnPending) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.card.delete({ where: { id: cardId } });

  // classroom-boards-tab "🟢 새 활동" 배지 — 큐 카드 삭제도 활동 신호.
  await touchBoardUpdatedAt(board.id);
  void announceQueueChange(board.id, cardId, "delete");

  return NextResponse.json({ ok: true });
}
