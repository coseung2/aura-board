import type { Prisma } from "@prisma/client";

export type CommentLikeActor =
  | { kind: "teacher"; id: string }
  | { kind: "student"; id: string }
  | { kind: "parent"; id: string };

type CommentLikeDelegate = {
  create(args: { data: Prisma.CardCommentLikeUncheckedCreateInput }): Promise<unknown>;
  deleteMany(args: { where: Prisma.CardCommentLikeWhereInput }): Promise<{ count: number }>;
};

export function getPrismaErrorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function isUniqueConflict(error: unknown): boolean {
  return getPrismaErrorCode(error) === "P2002";
}

export function commentLikeWhere(
  commentId: string,
  actor: CommentLikeActor,
): Prisma.CardCommentLikeWhereInput {
  if (actor.kind === "teacher") return { commentId, likerUserId: actor.id };
  if (actor.kind === "student") return { commentId, likerStudentId: actor.id };
  return { commentId, likerParentId: actor.id };
}

function commentLikeCreateData(
  commentId: string,
  actor: CommentLikeActor,
): Prisma.CardCommentLikeUncheckedCreateInput {
  if (actor.kind === "teacher") {
    return {
      commentId,
      likerKind: "teacher",
      likerUserId: actor.id,
      likerStudentId: null,
      likerParentId: null,
    };
  }
  if (actor.kind === "parent") {
    return {
      commentId,
      likerKind: "external",
      likerUserId: null,
      likerStudentId: null,
      likerParentId: actor.id,
    };
  }
  return {
    commentId,
    likerKind: "student",
    likerUserId: null,
    likerStudentId: actor.id,
    likerParentId: null,
  };
}

async function ensureLiked(
  commentLike: CommentLikeDelegate,
  commentId: string,
  actor: CommentLikeActor,
): Promise<true> {
  try {
    await commentLike.create({ data: commentLikeCreateData(commentId, actor) });
  } catch (error) {
    // A second in-flight request may have inserted the same actor's like.
    // The unique index makes this an idempotent success.
    if (!isUniqueConflict(error)) throw error;
  }
  return true;
}

/**
 * Apply an idempotent comment-like mutation.
 *
 * `desiredLiked` is used by current clients. Omitting it keeps legacy toggle
 * behavior for callers that still send an empty POST body.
 */
export async function applyCommentLikeMutation(
  commentLike: CommentLikeDelegate,
  commentId: string,
  actor: CommentLikeActor,
  desiredLiked: boolean | undefined,
): Promise<boolean> {
  const where = commentLikeWhere(commentId, actor);

  if (desiredLiked === false) {
    await commentLike.deleteMany({ where });
    return false;
  }

  if (desiredLiked === true) {
    return ensureLiked(commentLike, commentId, actor);
  }

  const removed = await commentLike.deleteMany({ where });
  if (removed.count > 0) return false;

  return ensureLiked(commentLike, commentId, actor);
}
