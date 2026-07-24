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
  audience: z.enum(["public", "guardian"]).default("public"),
});

const AudienceSchema = z.enum(["public", "guardian"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await authorizeCardAccess(cardId, actor, "read");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const audienceResult = AudienceSchema.safeParse(
    new URL(req.url).searchParams.get("audience") ?? "public",
  );
  if (!audienceResult.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const audience = audienceResult.data;
  if (audience === "guardian" && !access.ctx.guardianAvailable) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await db.cardComment.findMany({
    where: { cardId, audience, deletedAt: null },
    // comments-newest-first (2026-04-26): 최근 댓글이 상단.
    orderBy: { createdAt: "desc" },
    include: {
      authorUser: { select: { id: true, name: true } },
      authorStudent: { select: { id: true, name: true } },
      authorParent: { select: { id: true, name: true } },
      _count: { select: { likes: true } },
      // A comment like is limited to one row per actor by the schema's
      // composite unique index, so this relation is at most one row.
      likes: {
        where:
          actor.kind === "teacher"
            ? { likerUserId: actor.id }
            : actor.kind === "student"
              ? { likerStudentId: actor.id }
              : { likerParentId: actor.id },
        select: { id: true },
        take: 1,
      },
    },
  });

  const items = rows.map((r) => {
    const authorKind = r.authorParentId ? "parent" : r.authorKind;
    const rawName =
      authorKind === "teacher"
        ? r.authorUser?.name ?? ""
        : authorKind === "student"
          ? r.authorStudent?.name ?? ""
          : r.authorParent?.name ?? "";
    const authorId =
      authorKind === "teacher"
        ? r.authorUser?.id ?? null
        : authorKind === "student"
          ? r.authorStudent?.id ?? null
          : r.authorParent?.id ?? null;
    const ownByMe =
      authorId !== null &&
      ((authorKind === "teacher" && actor.kind === "teacher" && actor.id === authorId) ||
        (authorKind === "student" && actor.kind === "student" && actor.id === authorId) ||
        (authorKind === "parent" && actor.kind === "parent" && actor.id === authorId));
    return {
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      authorKind,
      audience: r.audience,
      authorLabel: formatEngagementAuthor({
        kind: authorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: ownByMe || actor.kind === "teacher",
      likeCount: r._count.likes,
      isLiked: r.likes.length > 0,
    };
  });

  return NextResponse.json({ items, guardianAvailable: access.ctx.guardianAvailable });
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

  const audience = parsed.data.audience;
  if (actor.kind === "parent" && audience !== "guardian") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (audience === "guardian" && !access.ctx.guardianAvailable) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isTeacher = actor.kind === "teacher";
  const studentActor = actor.kind === "student" ? actor : null;
  const parentActor = actor.kind === "parent" ? actor : null;
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
    authorParent: { select: { id: true, name: true } },
  } as const;
  let reward: { amount: number; baseAmount: number; buffBps: number } | null = null;
  let created;
  try {
    const result = await retryActivityRewardTransaction(() =>
      db.$transaction(async (tx) => {
        if ((studentActor || parentActor) && parsed.data.clientRequestId) {
          const replay = await tx.cardComment.findFirst({
            where: {
              cardId,
              clientRequestId: parsed.data.clientRequestId,
              ...(studentActor
                ? { authorStudentId: studentActor.id }
                : { authorParentId: parentActor!.id }),
            },
            include: includeAuthors,
          });
          if (replay) return { created: replay, reward: null };
        }

        const recentStudentComments = studentActor
          ? await tx.cardComment.findMany({
              where: {
                authorStudentId: studentActor.id,
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
            audience,
            authorKind: isTeacher ? "teacher" : studentActor ? "student" : "external",
            authorUserId: isTeacher ? actor.id : null,
            authorStudentId: studentActor?.id ?? null,
            authorParentId: parentActor?.id ?? null,
            clientRequestId: studentActor || parentActor ? parsed.data.clientRequestId : null,
            content: storedContent,
          },
          include: includeAuthors,
        });

        if (!studentActor || !accountId || duplicate) return { created: comment, reward: null };
        const policy = await loadRewardPolicy(tx, studentActor.classroomId);
        if (!isMeaningfulRewardComment(normalizedContent, policy.commentMinMeaningfulLength)) {
          return { created: comment, reward: null };
        }
        const paid = await awardCappedPolicyReward({
          tx,
          studentId: studentActor.id,
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
      (studentActor || parentActor) &&
      parsed.data.clientRequestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      created = await db.cardComment.findFirst({
        where: {
          cardId,
          clientRequestId: parsed.data.clientRequestId,
          ...(studentActor
            ? { authorStudentId: studentActor.id }
            : { authorParentId: parentActor!.id }),
        },
        include: includeAuthors,
      });
      if (!created) throw error;
    } else {
      throw error;
    }
  }

  if (audience === "public") {
    try {
      const [likeCount, commentCount, card] = await Promise.all([
        db.cardLike.count({ where: { cardId } }),
        db.cardComment.count({ where: { cardId, audience: "public", deletedAt: null } }),
        db.card.findUnique({ where: { id: cardId }, select: { boardId: true } }),
      ]);
      if (card) {
        await touchBoardUpdatedAt(card.boardId, {
          action: "comment.created",
          actorType: isTeacher ? "teacher" : studentActor ? "student" : "guest",
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
  }

  const createdAuthorKind = created.authorParentId ? "parent" : created.authorKind;
  const rawName = actor.name;
  return NextResponse.json({
    reward,
    item: {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
      authorKind: createdAuthorKind,
      audience: created.audience,
      authorLabel: formatEngagementAuthor({
        kind: createdAuthorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: true,
      likeCount: 0,
      isLiked: false,
    },
    guardianAvailable: access.ctx.guardianAvailable,
  });
}
