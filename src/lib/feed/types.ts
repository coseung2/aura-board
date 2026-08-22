export type FeedAuthorKind = "PLATFORM" | "TEACHER" | "STUDENT";
export type FeedPostStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type FeedMediaKind = "IMAGE" | "YOUTUBE";
export type FeedPublicationScope = "GLOBAL" | "CLASSROOM";
export type FeedPublicationStatus = "ACTIVE" | "REMOVED";
export type FeedPoolStatus = "AVAILABLE" | "WITHDRAWN";
export type FeedHiddenReason = "item" | "author";

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

export type FeedCommentItem = {
  id: string;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  authorKind: FeedAuthorKind;
  authorId: string | null;
  authorStudentId: string | null;
  authorLabel: string;
  canDelete: boolean;
  canModerate: boolean;
  canReply: boolean;
  hiddenReason: FeedHiddenReason | null;
  likeCount: number;
  isLiked: boolean;
  replies: FeedCommentItem[];
};

export type FeedCommentPage = {
  items: FeedCommentItem[];
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
