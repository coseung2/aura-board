"use client";

import type { ReactNode } from "react";
import type { FeedAuthorKind, FeedMedia } from "@/lib/feed/types";
import { CardBody } from "@/components/cards/CardBody";

type FeedPostCardData = {
  postId: string;
  authorKind: FeedAuthorKind;
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  media: FeedMedia[];
  timestamp: string;
  scopeLabel?: string | null;
};

type Props = {
  item: FeedPostCardData;
  actions?: ReactNode;
};

const AUTHOR_KIND_LABELS: Record<FeedAuthorKind, string> = {
  PLATFORM: "Aura 공식",
  TEACHER: "선생님",
  STUDENT: "학생",
};

export function FeedPostCard({ item, actions }: Props) {
  const attachments = item.media.map((media) => ({
    id: media.id,
    kind: media.kind === "IMAGE" ? "image" : "video",
    url: media.url,
    previewUrl: null,
    fileName: media.altText ?? null,
    fileSize: null,
    mimeType: media.kind === "IMAGE" ? "image/*" : "video/youtube",
    order: media.position,
  }));

  return (
    <article className="padlet-card ab-feed-card" data-post-id={item.postId}>
      <div className="ab-feed-card-meta">
        <span className="ab-feed-author-kind">{AUTHOR_KIND_LABELS[item.authorKind]}</span>
        {item.scopeLabel ? (
          <span className="ab-feed-scope-badge">{item.scopeLabel}</span>
        ) : null}
      </div>
      <CardBody
        card={{
          id: item.postId,
          title: item.title ?? "",
          content: item.body ?? "",
          attachments,
          authorName: item.authorDisplayName,
          createdAt: item.timestamp,
        }}
        attachmentsVariant="detail"
        contentDisplay="full"
        showEngagement={false}
      />
      {actions ? <div className="ab-feed-card-actions">{actions}</div> : null}
    </article>
  );
}
