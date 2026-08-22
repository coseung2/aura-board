import { db } from "@/lib/db";
import type { FeedAuthorKind, FeedCommentItem } from "./types";
import {
  feedHiddenReason,
  findAccessibleFeedPost,
  loadFeedHiddenState,
  type FeedHiddenState,
  type FeedViewer,
} from "./repository";

type CommentRow = {
  id: string;
  parentCommentId: string | null;
  content: string;
  createdAt: Date;
  authorKind: string;
  authorUserId: string | null;
  authorStudentId: string | null;
  authorUser: { id: string; name: string } | null;
  authorStudent: { id: string; name: string } | null;
  likeCount: number;
  isLiked: boolean;
};

function likeWhere(viewer: FeedViewer) {
  return viewer.kind === "student"
    ? { likerStudentId: viewer.id }
    : { likerUserId: viewer.id };
}

function toComment(row: CommentRow, hidden: FeedHiddenState | null, viewer: FeedViewer): FeedCommentItem {
  const hiddenReason = feedHiddenReason(hidden, "comment", row.id, row.authorStudentId);
  const authorId = row.authorStudentId ?? row.authorUserId;
  const own =
    (viewer.kind === "student" && row.authorStudentId === viewer.id) ||
    (viewer.kind === "teacher" && row.authorUserId === viewer.id);
  return {
    id: row.id,
    parentCommentId: row.parentCommentId,
    content: hiddenReason ? "" : row.content,
    createdAt: row.createdAt.toISOString(),
    authorKind: row.authorKind.toUpperCase() as FeedAuthorKind,
    authorId,
    authorStudentId: row.authorStudentId,
    authorLabel: hiddenReason ? "" : row.authorStudent?.name ?? row.authorUser?.name ?? "사용자",
    canDelete: own,
    canModerate: viewer.kind === "student" && !own,
    canReply: !hiddenReason,
    hiddenReason,
    likeCount: row.likeCount,
    isLiked: row.isLiked,
    replies: [],
  };
}

export async function listFeedComments(postId: string, viewer: FeedViewer) {
  if (!(await findAccessibleFeedPost(postId, viewer))) return null;
  const hidden = await loadFeedHiddenState(viewer);
  const rows = await db.feedComment.findMany({
    where: {
      postId,
      deletedAt: null,
      ...(viewer.kind === "student" ? { classroomId: viewer.classroomId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      authorUser: { select: { id: true, name: true } },
      authorStudent: { select: { id: true, name: true } },
      _count: { select: { likes: true } },
      likes: { where: likeWhere(viewer), select: { id: true }, take: 1 },
    },
  });
  const flat = rows.map((row) =>
    toComment({
      ...row,
      likeCount: row._count.likes,
      isLiked: row.likes.length > 0,
    }, hidden, viewer),
  );
  const byId = new Map(flat.map((item) => [item.id, item]));
  const items: FeedCommentItem[] = [];
  for (const item of flat) {
    if (!item.parentCommentId) items.push(item);
    else {
      const root = byId.get(item.parentCommentId);
      if (root && !root.parentCommentId) root.replies.push(item);
    }
  }
  return { items };
}

export async function createFeedComment(input: {
  postId: string;
  viewer: FeedViewer;
  content: string;
  parentCommentId?: string | null;
}) {
  if (!(await findAccessibleFeedPost(input.postId, input.viewer))) return "not_found" as const;
  if (input.viewer.kind !== "student") return "forbidden" as const;
  const content = input.content.trim();
  if (!content || content.length > 1000) return "invalid" as const;
  let parentCommentId = input.parentCommentId ?? null;
  if (parentCommentId) {
    const parent = await db.feedComment.findFirst({
      where: {
        id: parentCommentId,
        postId: input.postId,
        classroomId: input.viewer.classroomId,
        deletedAt: null,
      },
      select: { id: true, parentCommentId: true },
    });
    if (!parent) return "reply_target_not_found" as const;
    parentCommentId = parent.parentCommentId ?? parent.id;
  }
  const created = await db.feedComment.create({
    data: {
      postId: input.postId,
      classroomId: input.viewer.classroomId,
      content,
      parentCommentId,
      authorKind: "student",
      authorUserId: null,
      authorStudentId: input.viewer.id,
    },
    select: { id: true },
  });
  return { id: created.id };
}

export async function toggleFeedCommentLike(input: {
  commentId: string;
  viewer: FeedViewer;
  desiredLiked: boolean | undefined;
}) {
  const publicationWhere = input.viewer.kind === "student"
    ? { status: "ACTIVE", OR: [{ classroomId: null }, { classroomId: input.viewer.classroomId }] }
    : { status: "ACTIVE", scope: "CLASSROOM", classroom: { teacherId: input.viewer.id } };
  const comment = await db.feedComment.findFirst({
    where: {
      id: input.commentId,
      deletedAt: null,
      ...(input.viewer.kind === "student"
        ? { classroomId: input.viewer.classroomId }
        : { classroom: { teacherId: input.viewer.id } }),
      post: { publications: { some: publicationWhere } },
    },
    select: { id: true },
  });
  if (!comment) return null;
  const where = { commentId: input.commentId, ...likeWhere(input.viewer) };
  let liked: boolean;
  if (input.desiredLiked === false) {
    await db.feedCommentLike.deleteMany({ where });
    liked = false;
  } else if (input.desiredLiked === true) {
    await db.feedCommentLike.createMany({
      data: input.viewer.kind === "student"
        ? { commentId: input.commentId, likerKind: "student", likerStudentId: input.viewer.id }
        : { commentId: input.commentId, likerKind: "teacher", likerUserId: input.viewer.id },
      skipDuplicates: true,
    });
    liked = true;
  } else {
    const removed = await db.feedCommentLike.deleteMany({ where });
    liked = removed.count === 0;
    if (liked) {
      await db.feedCommentLike.createMany({
        data: input.viewer.kind === "student"
          ? { commentId: input.commentId, likerKind: "student", likerStudentId: input.viewer.id }
          : { commentId: input.commentId, likerKind: "teacher", likerUserId: input.viewer.id },
        skipDuplicates: true,
      });
    }
  }
  return { liked, count: await db.feedCommentLike.count({ where: { commentId: input.commentId } }) };
}

export async function deleteFeedComment(commentId: string, viewer: FeedViewer) {
  const comment = await db.feedComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
      ...(viewer.kind === "student"
        ? { classroomId: viewer.classroomId }
        : { classroom: { teacherId: viewer.id } }),
      post: { publications: { some: { status: "ACTIVE", ...(viewer.kind === "student" ? { OR: [{ classroomId: null }, { classroomId: viewer.classroomId }] } : { scope: "CLASSROOM", classroom: { teacherId: viewer.id } }) } } },
    },
    select: { parentCommentId: true, authorStudentId: true, authorUserId: true },
  });
  if (!comment) return "not_found" as const;
  const own = viewer.kind === "student" ? comment.authorStudentId === viewer.id : comment.authorUserId === viewer.id;
  if (!own) return "forbidden" as const;
  const rootId = comment.parentCommentId ?? commentId;
  await db.feedComment.updateMany({ where: { OR: [{ id: rootId }, { parentCommentId: rootId }], deletedAt: null }, data: { deletedAt: new Date() } });
  return "deleted" as const;
}
