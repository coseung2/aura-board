import type { CommentAudience } from "./comment-audience";
import type { HiddenReason } from "./content-safety";

export type MobileCommentItem = {
  id: string;
  parentCommentId?: string | null;
  content: string;
  createdAt: string;
  audience?: CommentAudience;
  authorLabel: string;
  likeCount?: number;
  isLiked?: boolean;
  canDelete: boolean;
  canModerate?: boolean;
  hiddenReason?: HiddenReason | null;
  authorStudentId?: string | null;
  replies?: MobileCommentItem[];
};

export function updateThreadComment(
  items: MobileCommentItem[],
  commentId: string,
  update: (item: MobileCommentItem) => MobileCommentItem,
): MobileCommentItem[] {
  return items.map((root) => {
    if (root.id === commentId) return update(root);
    return {
      ...root,
      replies: (root.replies ?? []).map((reply) =>
        reply.id === commentId ? update(reply) : reply,
      ),
    };
  });
}

export function removeThreadComment(
  items: MobileCommentItem[],
  commentId: string,
): MobileCommentItem[] {
  return items
    .filter((root) => root.id !== commentId)
    .map((root) => ({
      ...root,
      replies: (root.replies ?? []).filter((reply) => reply.id !== commentId),
    }));
}

export function appendThreadReply(
  items: MobileCommentItem[],
  rootCommentId: string,
  reply: MobileCommentItem,
): MobileCommentItem[] {
  return items.map((root) =>
    root.id === rootCommentId
      ? { ...root, replies: [...(root.replies ?? []), reply] }
      : root,
  );
}
