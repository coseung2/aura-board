export type CommentAudience = "public" | "guardian";
export type CommentViewer = "student" | "parent";

type AudienceComment = {
  audience?: CommentAudience;
};

export function initialCommentAudience(viewer: CommentViewer): CommentAudience {
  return viewer === "parent" ? "guardian" : "public";
}

/** Student-facing wording for the two server-side comment audiences. */
export function commentAudienceLabel(audience: CommentAudience): string {
  return audience === "guardian" ? "가족 댓글" : "우리반 댓글";
}

export const FAMILY_THREAD_PRIVATE_MESSAGE =
  "가족 댓글은 게시글 작성자와 가족만 볼 수 있어요.";

export function commentsPath(cardId: string, audience: CommentAudience): string {
  return `/api/cards/${encodeURIComponent(cardId)}/comments?audience=${audience}`;
}

/**
 * Parent cards are a closed family space. Older servers may ignore the
 * audience query or omit the audience field, so accept only explicitly marked
 * guardian rows after the server confirms guardian access.
 */
export function visibleCommentsForViewer<T extends AudienceComment>(
  viewer: CommentViewer,
  guardianAvailable: boolean,
  items: T[],
): T[] {
  if (viewer !== "parent") return items;
  if (!guardianAvailable) return [];
  return items.filter((item) => item.audience === "guardian");
}

export function canComposeComment(
  viewer: CommentViewer,
  audience: CommentAudience,
): boolean {
  return viewer === "student" || audience === "guardian";
}
