export interface CommentItem {
  id: string;
  parentCommentId?: string | null;
  content: string;
  createdAt: string;
  authorKind: "teacher" | "student" | "parent" | "external";
  audience?: CommentAudience;
  authorLabel: string;
  canDelete: boolean;
  canModerate?: boolean;
  hiddenReason?: HiddenReason | null;
  authorStudentId?: string | null;
  replies?: CommentItem[];
}

export type CommentAudience = "public" | "guardian";

export function appendThreadReply(
  items: CommentItem[],
  rootCommentId: string,
  reply: CommentItem,
): CommentItem[] {
  return items.map((root) =>
    root.id === rootCommentId
      ? { ...root, replies: [...(root.replies ?? []), reply] }
      : root,
  );
}

export function removeThreadComment(
  items: CommentItem[],
  commentId: string,
): CommentItem[] {
  return items
    .filter((root) => root.id !== commentId)
    .map((root) => ({
      ...root,
      replies: (root.replies ?? []).filter((reply) => reply.id !== commentId),
    }));
}

export function updateThreadComments(
  items: CommentItem[],
  update: (item: CommentItem) => CommentItem,
): CommentItem[] {
  return items.map((root) => ({
    ...update(root),
    replies: (root.replies ?? []).map(update),
  }));
}

export function studentViewerHeaders(
  isStudentViewer: boolean,
): Record<string, string> {
  return isStudentViewer ? { "x-aura-student-viewer": "1" } : {};
}
import type { HiddenReason } from "@/components/moderation/StudentContentModeration";
