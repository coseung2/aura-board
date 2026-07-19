"use client";

import Image from "next/image";
import type { ParentPostDTO } from "@/lib/parent-post-dto";
import {
  countParentFeedAttachments,
  resolveParentFeedAuthor,
} from "@/lib/parent-feed-presentation";
import { buildSourceLabel } from "@/components/portfolio/source-label";

type Props = {
  post: ParentPostDTO;
  onOpen: (post: ParentPostDTO) => void;
  highlighted?: boolean;
};

export function ParentPostCard({ post, onOpen, highlighted = false }: Props) {
  const childNames = post.linkedChildren.map((child) => child.name).join(" · ");
  const attribution = childNames || "우리 아이";
  const sourceLabel = buildSourceLabel({
    boardTitle: post.sourceBoard.title,
    boardLayout: post.sourceBoard.layout,
    sectionTitle: post.sourceSection?.title ?? null,
  });
  const imageUrl = getPostImage(post);
  const videoUrl =
    post.videoUrl ?? post.attachments.find((item) => item.kind === "video")?.url ?? null;
  const attachmentCount = countParentFeedAttachments(post);
  const authorName = resolveParentFeedAuthor(post, attribution);

  return (
    <article
      id={`parent-post-${post.id}`}
      className={`parent-feed-post${highlighted ? " is-highlighted" : ""}`}
      tabIndex={highlighted ? -1 : undefined}
    >
      <header className="parent-feed-post-header">
        <span className="parent-feed-post-avatar" aria-hidden>
          {post.linkedChildren.map((child) => child.name.trim().slice(0, 1)).join("") || "아"}
        </span>
        <button type="button" className="parent-feed-post-heading" onClick={() => onOpen(post)}>
          <strong>{authorName}</strong>
          <span>{attribution} · {sourceLabel}</span>
        </button>
        <time dateTime={post.createdAt}>{formatFeedDate(post.createdAt)}</time>
      </header>

      <div className="parent-feed-post-media">
        {videoUrl ? (
          <video controls preload="metadata" poster={imageUrl ?? undefined}>
            <source src={videoUrl} />
          </video>
        ) : imageUrl ? (
          <button type="button" onClick={() => onOpen(post)} aria-label={`${post.title || "게시물"} 자세히 보기`}>
            <Image
              src={imageUrl}
              alt={post.title || `${attribution} 게시물`}
              fill
              sizes="(max-width: 767px) 100vw, 630px"
              unoptimized
            />
          </button>
        ) : (
          <button
            type="button"
            className="parent-feed-post-text-media"
            style={{ background: buildFallbackBackground(post.color) }}
            onClick={() => onOpen(post)}
            aria-label={`${post.title || "게시물"} 자세히 보기`}
          >
            <span>{post.title || "교실 기록"}</span>
            {post.content ? <p>{post.content}</p> : null}
          </button>
        )}
        {attachmentCount > 1 ? (
          <span className="parent-feed-media-count" aria-label={`첨부 ${attachmentCount}개`}>
            1 / {attachmentCount}
          </span>
        ) : null}
      </div>

      <div className="parent-feed-post-actions" aria-label="게시물 반응 요약">
        <span title="좋아요"><HeartIcon /> {post.likeCount.toLocaleString("ko-KR")}</span>
        <span title="댓글"><CommentIcon /> {post.commentCount.toLocaleString("ko-KR")}</span>
        <button type="button" onClick={() => onOpen(post)}>자세히 보기</button>
      </div>

      <div className="parent-feed-post-caption">
        <p>
          <strong>{attribution}</strong>
          {post.title ? <b>{post.title}</b> : null}
          {post.content ? <span>{post.content}</span> : null}
        </p>
        {post.linkTitle ? <small>{post.linkTitle}</small> : null}
      </div>
    </article>
  );
}

export function getPostImage(post: ParentPostDTO): string | null {
  return (
    post.thumbUrl ??
    post.imageUrl ??
    post.attachments.find((item) => item.kind === "image")?.previewUrl ??
    post.attachments.find((item) => item.kind === "image")?.url ??
    post.linkImage
  );
}

export function buildFallbackBackground(color: string | null): string {
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#7667ed";
  return `linear-gradient(145deg, ${base}, color-mix(in srgb, ${base} 68%, #111827))`;
}

function formatFeedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

function HeartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" /></svg>;
}

function CommentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.6-4.3A8.6 8.6 0 1 1 21 11.5Z" /></svg>;
}
