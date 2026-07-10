"use client";

import Image from "next/image";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import {
  countParentFeedAttachments,
  resolveParentFeedAuthor,
} from "@/lib/parent-feed-presentation";
import { buildSourceLabel } from "./source-label";

type Props = {
  card: PortfolioCardDTO;
  childName: string;
  onOpen: (card: PortfolioCardDTO) => void;
};

export function ParentFeedPost({ card, childName, onOpen }: Props) {
  const sourceLabel = buildSourceLabel({
    boardTitle: card.sourceBoard.title,
    boardLayout: card.sourceBoard.layout,
    sectionTitle: card.sourceSection?.title ?? null,
  });
  const imageUrl =
    card.thumbUrl ??
    card.imageUrl ??
    card.attachments.find((item) => item.kind === "image")?.previewUrl ??
    card.attachments.find((item) => item.kind === "image")?.url ??
    card.linkImage;
  const videoUrl =
    card.videoUrl ?? card.attachments.find((item) => item.kind === "video")?.url ?? null;
  const attachmentCount = countParentFeedAttachments(card);
  const authorName = resolveParentFeedAuthor(card, childName);

  return (
    <article className="parent-feed-post">
      <header className="parent-feed-post-header">
        <span className="parent-feed-post-avatar" aria-hidden>
          {childName.trim().slice(0, 1) || "아"}
        </span>
        <button type="button" className="parent-feed-post-heading" onClick={() => onOpen(card)}>
          <strong>{authorName}</strong>
          <span>{sourceLabel}</span>
        </button>
        <time dateTime={card.createdAt}>{formatFeedDate(card.createdAt)}</time>
      </header>

      <div className="parent-feed-post-media">
        {videoUrl ? (
          <video controls preload="metadata" poster={imageUrl ?? undefined}>
            <source src={videoUrl} />
          </video>
        ) : imageUrl ? (
          <button type="button" onClick={() => onOpen(card)} aria-label={`${card.title || "게시물"} 자세히 보기`}>
            <Image
              src={imageUrl}
              alt={card.title || `${childName}의 게시물`}
              fill
              sizes="(max-width: 767px) 100vw, 630px"
              unoptimized
            />
          </button>
        ) : (
          <button
            type="button"
            className="parent-feed-post-text-media"
            style={{ background: buildFallbackBackground(card.color) }}
            onClick={() => onOpen(card)}
            aria-label={`${card.title || "게시물"} 자세히 보기`}
          >
            <span>{card.title || "오늘의 교실 기록"}</span>
            {card.content ? <p>{card.content}</p> : null}
          </button>
        )}
        {attachmentCount > 1 ? (
          <span className="parent-feed-media-count" aria-label={`첨부 ${attachmentCount}개`}>
            1 / {attachmentCount}
          </span>
        ) : null}
      </div>

      <div className="parent-feed-post-actions" aria-label="게시물 반응 요약">
        <span title="좋아요 수">
          <HeartIcon /> {card.likeCount.toLocaleString("ko-KR")}
        </span>
        <span title="댓글 수">
          <CommentIcon /> {card.commentCount.toLocaleString("ko-KR")}
        </span>
        <button type="button" onClick={() => onOpen(card)}>자세히 보기</button>
      </div>

      <div className="parent-feed-post-caption">
        <p>
          <strong>{childName}</strong>
          {card.title ? <b>{card.title}</b> : null}
          {card.content ? <span>{card.content}</span> : null}
        </p>
        {card.linkTitle ? <small>{card.linkTitle}</small> : null}
      </div>
    </article>
  );
}

function formatFeedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function buildFallbackBackground(color: string | null): string {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#7667ed";
  return `linear-gradient(145deg, ${base}, color-mix(in srgb, ${base} 68%, #111827))`;
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.6-4.3A8.6 8.6 0 1 1 21 11.5Z" />
    </svg>
  );
}
