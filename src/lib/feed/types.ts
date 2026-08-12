export type FeedAuthorKind = "PLATFORM" | "TEACHER" | "STUDENT";
export type FeedPostStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type FeedMediaKind = "IMAGE" | "YOUTUBE";
export type FeedPublicationScope = "GLOBAL" | "CLASSROOM";
export type FeedPublicationStatus = "ACTIVE" | "REMOVED";
export type FeedPoolStatus = "AVAILABLE" | "WITHDRAWN";

export type FeedMediaInput = {
  kind: FeedMediaKind;
  url: string;
  youtubeVideoId?: string | null;
  altText?: string | null;
};

export type FeedMedia = FeedMediaInput & {
  id: string;
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

export type FeedPoolItem = {
  postId: string;
  authorKind: FeedAuthorKind;
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  createdAt: string;
  media: FeedMedia[];
};
