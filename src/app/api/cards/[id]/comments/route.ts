import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";
import { formatEngagementAuthor } from "@/lib/card-engagement-format";
import { announceEngagementChange } from "@/lib/realtime-broadcast";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { retryActivityRewardTransaction } from "@/lib/creatures/activity-rewards";
import { isMeaningfulRewardComment, normalizeRewardComment } from "@/lib/reward-policy";
import { awardCappedPolicyReward, loadRewardPolicy } from "@/lib/reward-service";

// card-comments-likes (2026-04-26): GET list / POST create.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateSchema = z.object({
  content: z.string().min(1).max(1000),
  clientRequestId: z.string().trim().min(8).max(100).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await authorizeCardAccess(cardId, actor, "read");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const rows = await db.cardComment.findMany({
    where: { cardId, deletedAt: null },
    // comments-newest-first (2026-04-26): 최근 댓글이 상단.
    orderBy: { createdAt: "desc" },
    include: {
      authorUser: { select: { id: true, name: true } },
      authorStudent: { select: { id: true, name: true } },
      _count: { select: { likes: true } },
      // A comment like is limited to one row per actor by the schema's
      // composite unique index, so this relation is at most one row.
      likes: {
        where:
          actor.kind === "teacher"
            ? { likerUserId: actor.id }
            : actor.kind === "student"
              ? { likerStudentId: actor.id }
              : { id: "__parent_cannot_like_comments__" },
        select: { id: true },
        take: 1,
      },
    },
  });

  const items = rows.map((r) => {
    const isTeacher = r.authorKind === "teacher";
    const rawName = isTeacher ? r.authorUser?.name ?? "" : r.authorStudent?.name ?? "";
    const authorId = isTeacher ? r.authorUser?.id ?? null : r.authorStudent?.id ?? null;
    const ownByMe =
      authorId !== null &&
      ((isTeacher && actor.kind === "teacher" && actor.id === authorId) ||
        (!isTeacher && actor.kind === "student" && actor.id === authorId));
    return {
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      authorKind: r.authorKind,
      authorLabel: formatEngagementAuthor({
        kind: r.authorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: ownByMe || actor.kind === "teacher",
      likeCount: r._count.likes,
      isLiked: r.likes.length > 0,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await authorizeCardAccess(cardId, actor, "write");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const isTeacher = actor.kind === "teacher";
  const studentActor = actor.kind === "student" ? actor : null;
  const storedContent = parsed.data.content.trim();
  const normalizedContent = normalizeRewardComment(storedContent);
  if (!normalizedContent) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const accountId = !studentActor
    ? null
    : (await ensureAccountFor({ id: studentActor.id, classroomId: studentActor.classroomId })).accountId;
  const includeAuthors = {
    authorUser: { select: { id: true, name: true } },
    authorStudent: { select: { id: true, name: true } },
  } as const;
  let reward: { amount: number; baseAmount: number; buffBps: number } | null = null;
  let created;
  try {
    const result = await retryActivityRewardTransaction(() =>
      db.$transaction(async (tx) => {
        if (!isTeacher && parsed.data.clientRequestId) {
          const replay = await tx.cardComment.findUnique({
            where: {
              authorStudentId_cardId_clientRequestId: {
                authorStudentId: actor.id,
                cardId,
                clientRequestId: parsed.data.clientRequestId,
              },
            },
            include: includeAuthors,
          });
          if (replay) return { created: replay, reward: null };
        }

        const recentStudentComments = !isTeacher
          ? await tx.cardComment.findMany({
              where: {
                authorStudentId: actor.id,
              },
              select: { content: true },
            })
          : [];
        const duplicate = recentStudentComments.some(
          (comment) => normalizeRewardComment(comment.content) === normalizedContent,
        );
        const comment = await tx.cardComment.create({
          data: {
            cardId,
            authorKind: isTeacher ? "teacher" : "student",
            authorUserId: isTeacher ? actor.id : null,
            authorStudentId: !isTeacher ? actor.id : null,
            clientRequestId: !isTeacher ? parsed.data.clientRequestId : null,
            content: storedContent,
          },
          include: includeAuthors,
        });

        if (isTeacher || !accountId || duplicate) return { created: comment, reward: null };
        if (!studentActor) return { created: comment, reward: null };
        const policy = await loadRewardPolicy(tx, studentActor.classroomId);
        if (!isMeaningfulRewardComment(normalizedContent, policy.commentMinMeaningfulLength)) {
          return { created: comment, reward: null };
        }
        const paid = await awardCappedPolicyReward({
          tx,
          studentId: actor.id,
          classroomId: studentActor.classroomId,
          accountId,
          area: "comment",
          sourceRef: comment.id,
          baseAmount: policy.commentRewardAmount,
          note: `댓글 작성 보상 [comment:${comment.id}]`,
          policy,
        });
        return { created: comment, reward: paid };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
    created = result.created;
    reward = result.reward
      ? {
          amount: result.reward.amount,
          baseAmount: result.reward.baseAmount,
          buffBps: result.reward.buffBps,
        }
      : null;
  } catch (error) {
    if (
      !isTeacher &&
      parsed.data.clientRequestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      created = await db.cardComment.findUnique({
        where: {
          authorStudentId_cardId_clientRequestId: {
            authorStudentId: actor.id,
            cardId,
            clientRequestId: parsed.data.clientRequestId,
          },
        },
        include: includeAuthors,
      });
      if (!created) throw error;
    } else {
      throw error;
    }
  }

  try {
    const [likeCount, commentCount, card] = await Promise.all([
      db.cardLike.count({ where: { cardId } }),
      db.cardComment.count({ where: { cardId, deletedAt: null } }),
      db.card.findUnique({ where: { id: cardId }, select: { boardId: true } }),
    ]);
    if (card) {
      await touchBoardUpdatedAt(card.boardId, {
        action: "comment.created",
        actorType: isTeacher ? "teacher" : "student",
        actorId: actor.id,
      });
      await announceEngagementChange(
        card.boardId,
        cardId,
        likeCount,
        commentCount,
        "comment",
      );
    }
  } catch {
    // Broadcast side-effects are non-fatal.
  }

  const rawName = isTeacher ? created.authorUser?.name ?? "" : created.authorStudent?.name ?? "";
  return NextResponse.json({
    reward,
    item: {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
      authorKind: created.authorKind,
      authorLabel: formatEngagementAuthor({
        kind: created.authorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: true,
      likeCount: 0,
      isLiked: false,
    },
  });
}
