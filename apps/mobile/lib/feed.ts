import { ApiError } from "./api";

export type FeedAuthorKind = "PLATFORM" | "TEACHER" | "STUDENT";
export type FeedMediaKind = "IMAGE" | "YOUTUBE";
export type FeedPublicationScope = "GLOBAL" | "CLASSROOM";

export type FeedMedia = {
  id: string;
  kind: FeedMediaKind;
  url: string;
  youtubeVideoId?: string | null;
  altText?: string | null;
  position: number;
};

export type FeedHiddenReason = "item" | "author";

/**
 * Student feed view returned by the FeedPost/FeedPublication API.
 *
 * This is intentionally not a BoardCard-shaped DTO. Feed publications are a
 * separate content space and keep their own post/publication identities.
 */
export type FeedPostView = {
  publicationId: string;
  postId: string;
  scope: FeedPublicationScope;
  classroomId: string | null;
  authorKind: FeedAuthorKind;
  authorId: string | null;
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  publishedAt: string;
  media: FeedMedia[];
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  canDelete: boolean;
  canHide: boolean;
  canReport: boolean;
  canBlockAuthor: boolean;
  hiddenReason: FeedHiddenReason | null;
};

export type FeedItem = FeedPostView;

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
};

export type FeedMediaInput = {
  kind: FeedMediaKind;
  url: string;
  altText?: string | null;
};

export type FeedDraft = {
  title: string | null;
  body: string | null;
  media: FeedMediaInput[];
};

export function youtubeThumbnailUrl(media: FeedMedia): string | null {
  if (media.kind !== "YOUTUBE") return null;
  const id = media.youtubeVideoId?.trim();
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export function feedApiMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const body = error.body;
  if (body && typeof body === "object" && "error" in body) {
    const code = (body as { error?: unknown }).error;
    if (code === "invalid_media") {
      return "YouTube 주소 또는 미디어 정보를 확인해 주세요.";
    }
    if (code === "invalid_payload") {
      return "게시물 내용을 확인해 주세요.";
    }
  }
  return fallback;
}
