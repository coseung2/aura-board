"use client";

import type { FeedItem } from "@/lib/feed/types";
import { FeedPostCard } from "./FeedPostCard";

type Props = {
  items: FeedItem[];
  loading: boolean;
  loadingMore?: boolean;
  error: string | null;
  nextCursor: string | null;
  emptyMessage: string;
  onRetry: () => void;
  onLoadMore: () => void;
};

export function FeedList({
  items,
  loading,
  loadingMore = false,
  error,
  nextCursor,
  emptyMessage,
  onRetry,
  onLoadMore,
}: Props) {
  if (loading && items.length === 0) {
    return <div className="ab-feed-state">피드를 불러오는 중…</div>;
  }

  if (error && items.length === 0) {
    return (
      <div className="ab-feed-state ab-feed-state-error" role="alert">
        <span>{error}</span>
        <button className="btn btn-secondary" type="button" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="ab-feed-state">{emptyMessage}</div>;
  }

  return (
    <div className="ab-feed-timeline">
      {error ? (
        <div className="ab-feed-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>다시 시도</button>
        </div>
      ) : null}
      {items.map((item) => (
        <FeedPostCard
          key={item.publicationId}
          item={{
            ...item,
            timestamp: item.publishedAt,
            scopeLabel: item.scope === "GLOBAL" ? "전체" : "우리 반",
          }}
        />
      ))}
      {nextCursor ? (
        <div className="ab-feed-load-more">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore ? "불러오는 중…" : "이전 게시물 더 보기"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
