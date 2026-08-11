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

export type FeedItem = {
  publicationId: string;
  postId: string;
  scope: FeedPublicationScope;
  classroomId: string | null;
  authorKind: FeedAuthorKind;
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  publishedAt: string;
  media: FeedMedia[];
};

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
