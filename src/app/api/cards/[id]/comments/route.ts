import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";
import { formatEngagementAuthor } from "@/lib/card-engagement-format";
import { resolveHiddenReason } from "@/lib/content-safety";
import { emptyHiddenLookup, loadHiddenLookup } from "@/lib/content-safety-service";
import { announceEngagementChange } from "@/lib/realtime-broadcast";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { schedulePostCommit } from "@/lib/post-commit";
import { invalidateBoardSnapshotCache } from "@/lib/board-snapshot-cache";
import { retryActivityRewardTransaction } from "@/lib/creatures/activity-rewards";
import { isMeaningfulRewardComment, normalizeRewardComment } from "@/lib/reward-policy";
import {
  awardCappedPolicyReward,
  loadPreparedCommentRewardContext,
  loadRewardPolicyCached,
} from "@/lib/reward-service";

// card-comments-likes (2026-04-26): GET list / POST create.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateSchema = z.object({
  content: z.string().min(1).max(1000),
  clientRequestId: z.string().trim().min(8).max(100).optional(),
  audience: z.enum(["public", "guardian"]).default("public"),
  parentCommentId: z.string().trim().min(1).max(191).nullable().optional(),
});

const AudienceSchema = z.enum(["public", "guardian"]);

type CommentThreadItem = {
  id: string;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  authorKind: string;
  audience: "public" | "guardian";
  authorLabel: string;
  canDelete: boolean;
  canModerate: boolean;
  hiddenReason: ReturnType<typeof resolveHiddenReason>;
  authorStudentId: string | null;
  likeCount: number;
  isLiked: boolean;
  replies: CommentThreadItem[];
};

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

  // Hiding is a per-student preference (App Store guideline 1.2). Teachers and
  // guardians always see the unfiltered thread so moderation is not affected.
  const hidden =
    actor.kind === "student" ? await loadHiddenLookup(actor.id) : emptyHiddenLookup();

  const flatItems = rows.map<CommentThreadItem>((r) => {
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
    // Hidden rows stay in the response so the client can render an inline
    // "숨긴 댓글 · 되돌리기" placeholder instead of silently reflowing the list.
    const hiddenReason = hidden.hasAnyHide
      ? resolveHiddenReason(hidden, "comment", r.id, r.authorStudentId)
      : null;
    return {
      id: r.id,
      parentCommentId: r.parentCommentId,
      content: hiddenReason ? "" : r.content,
      createdAt: r.createdAt.toISOString(),
      authorKind,
      audience: r.audience,
      authorLabel: formatEngagementAuthor({
        kind: authorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: ownByMe || actor.kind === "teacher",
      // Students may report/hide anything except their own writing.
      canModerate: actor.kind === "student" && !ownByMe,
      hiddenReason,
      authorStudentId: r.authorStudentId,
      likeCount: r._count.likes,
      isLiked: r.likes.length > 0,
      replies: [],
    };
  });

  const byId = new Map(flatItems.map((item) => [item.id, item]));
  const items: CommentThreadItem[] = [];
  for (const item of flatItems) {
    if (!item.parentCommentId) {
      items.push(item);
      continue;
    }
    const root = byId.get(item.parentCommentId);
    if (root && !root.parentCommentId) root.replies.push(item);
  }
  for (const item of items) {
    item.replies.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

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

  let threadRootId: string | null = null;
  if (parsed.data.parentCommentId) {
    const replyTarget = await db.cardComment.findFirst({
      where: {
        id: parsed.data.parentCommentId,
        cardId,
        audience,
        deletedAt: null,
      },
      select: { id: true, parentCommentId: true },
    });
    if (!replyTarget) {
      return NextResponse.json({ error: "reply_target_not_found" }, { status: 404 });
    }
    // Replying to a reply stays in the same flat thread.
    threadRootId = replyTarget.parentCommentId ?? replyTarget.id;
  }

  const isTeacher = actor.kind === "teacher";
  const studentActor = actor.kind === "student" ? actor : null;
  const parentActor = actor.kind === "parent" ? actor : null;
  const storedContent = parsed.data.content.trim();
  const normalizedContent = normalizeRewardComment(storedContent);
  if (!normalizedContent) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  let accountId: string | null = null;
  let studentRewardPolicy: Awaited<ReturnType<typeof loadRewardPolicyCached>> | null = null;
  if (studentActor) {
    const [account, policy] = await Promise.all([
      ensureAccountFor({
        id: studentActor.id,
        classroomId: studentActor.classroomId,
      }),
      loadRewardPolicyCached(studentActor.classroomId),
    ]);
    accountId = account.accountId;
    studentRewardPolicy = policy;
  }
  const commentSelect = {
    id: true,
    parentCommentId: true,
    content: true,
    createdAt: true,
    authorKind: true,
    audience: true,
    authorParentId: true,
    authorStudentId: true,
  } as const;
  let reward: { amount: number; baseAmount: number; buffBps: number } | null = null;
  let created;
  try {
    const result = await retryActivityRewardTransaction(() =>
      db.$transaction(async (tx) => {
        const policy = studentRewardPolicy;
        const shouldEvaluateReward = Boolean(
          studentActor &&
          accountId &&
          policy &&
          isMeaningfulRewardComment(
            normalizedContent,
            policy.commentMinMeaningfulLength,
          ),
        );
        const preparedReward =
          shouldEvaluateReward && studentActor && accountId && policy
            ? await loadPreparedCommentRewardContext(tx, {
                accountId,
                studentId: studentActor.id,
                classroomId: studentActor.classroomId,
                normalizedContent,
                policy,
              })
            : null;

        // The database uniqueness constraint is the retry gate. On a replay,
        // create raises P2002 and the outer recovery reads the committed row;
        // the common first-attempt path avoids a preflight SELECT.
        const comment = await tx.cardComment.create({
          data: {
            cardId,
            parentCommentId: threadRootId,
            audience,
            authorKind: isTeacher ? "teacher" : studentActor ? "student" : "external",
            authorUserId: isTeacher ? actor.id : null,
            authorStudentId: studentActor?.id ?? null,
            authorParentId: parentActor?.id ?? null,
            clientRequestId: studentActor || parentActor ? parsed.data.clientRequestId : null,
            content: storedContent,
          },
          select: commentSelect,
        });

        if (
          !studentActor ||
          !accountId ||
          !policy ||
          !preparedReward ||
          preparedReward.duplicate
        ) {
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
          accountAlreadyVerified: true,
          sourceAlreadyChecked: true,
          preparedCounts: preparedReward.counts,
          preparedRewardContext: preparedReward.rewardContext,
        });
        return { created: comment, reward: paid };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }),
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
          deletedAt: null,
          ...(studentActor
            ? { authorStudentId: studentActor.id }
            : { authorParentId: parentActor!.id }),
        },
        select: commentSelect,
      });
      if (!created) throw error;
    } else {
      throw error;
    }
  }

  if (audience === "public") {
    invalidateBoardSnapshotCache(access.ctx.boardId);
    schedulePostCommit("comment.create engagement", async () => {
      const [likeCount, commentCount] = await Promise.all([
        db.cardLike.count({ where: { cardId } }),
        db.cardComment.count({ where: { cardId, audience: "public", deletedAt: null } }),
      ]);
      await touchBoardUpdatedAt(access.ctx.boardId, {
        action: "comment.created",
        actorType: isTeacher ? "teacher" : studentActor ? "student" : "guest",
        actorId: actor.id,
        coalesceMs: 1_000,
      });
      await announceEngagementChange(
        access.ctx.boardId,
        cardId,
        likeCount,
        commentCount,
        "comment",
      );
    });
  }

  const createdAuthorKind = created.authorParentId ? "parent" : created.authorKind;
  const rawName = actor.name;
  return NextResponse.json({
    reward,
    item: {
      id: created.id,
      parentCommentId: created.parentCommentId ?? threadRootId,
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
      // Your own new comment is never reportable or hidden.
      canModerate: false,
      hiddenReason: null,
      authorStudentId: created.authorStudentId,
      likeCount: 0,
      isLiked: false,
      replies: [],
    },
    guardianAvailable: access.ctx.guardianAvailable,
  });
}
