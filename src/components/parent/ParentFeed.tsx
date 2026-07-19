"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ParentPostDTO } from "@/lib/parent-post-dto";
import type { ParentPendingLink } from "./ParentPendingLinks";
import { CardDetailModal } from "../cards/CardDetailModal";
import { portfolioCardToCardData } from "../portfolio/portfolio-card-adapter";
import { ParentPendingLinks } from "./ParentPendingLinks";
import { ParentPostCard } from "./ParentPostCard";
import { useParentPosts } from "./useParentPosts";

type Props = {
  pendingLinks?: ParentPendingLink[];
  childCount: number;
};

export function ParentFeed({ pendingLinks = [], childCount }: Props) {
  const requestedPostId = useSearchParams().get("post");
  const endpoint = requestedPostId
    ? `/api/parent/feed?post=${encodeURIComponent(requestedPostId)}`
    : "/api/parent/feed";
  const { data, error, loading, loadingMore, loadMore, retry } = useParentPosts(
    endpoint,
    "/api/parent/feed",
  );
  const [openPost, setOpenPost] = useState<ParentPostDTO | null>(null);
  const scrolledPostIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requestedPostId) {
      scrolledPostIdRef.current = null;
      return;
    }
    if (
      scrolledPostIdRef.current === requestedPostId ||
      !data?.items.some((post) => post.id === requestedPostId)
    ) {
      return;
    }
    const postElement = document.getElementById(`parent-post-${requestedPostId}`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    postElement?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    postElement?.focus({ preventScroll: true });
    scrolledPostIdRef.current = requestedPostId;
  }, [data, requestedPostId]);

  const selectedPost = openPost
    ? data?.items.find((post) => post.id === openPost.id) ?? openPost
    : null;

  return (
    <main className="parent-feed-page">
      <header className="parent-feed-titlebar">
        <div>
          <p>가족 소식</p>
          <h1>피드</h1>
        </div>
        <span>연결된 자녀 {childCount}명</span>
      </header>

      <ParentPendingLinks links={pendingLinks} compact />

      {loading ? <ParentFeedSkeleton /> : error ? (
        <ParentPostsError error={error} retry={retry} />
      ) : (
        <div className="parent-feed-layout">
          <section className="parent-feed-stream" aria-label="모든 자녀 게시물">
            {data?.items.length ? data.items.map((post) => (
              <ParentPostCard
                key={post.id}
                post={post}
                onOpen={setOpenPost}
                highlighted={post.id === requestedPostId}
              />
            )) : (
              <div className="parent-feed-empty">
                <span aria-hidden>□</span>
                <h2>아직 게시물이 없어요</h2>
                <p>연결된 자녀의 교실 게시물이 생기면 최신순으로 이곳에 모여요.</p>
                {childCount === 0 ? <Link href="/parent/onboard/match/code">자녀 연결하기</Link> : null}
              </div>
            )}
            {data?.nextCursor ? (
              <button type="button" className="parent-feed-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "불러오는 중…" : "이전 게시물 더 보기"}
              </button>
            ) : data?.items.length ? <p className="parent-feed-end">모든 게시물을 확인했어요</p> : null}
          </section>

          <aside className="parent-feed-sidebar-panel" aria-label="학부모 바로가기">
            <strong>학부모 메뉴</strong>
            <p className="parent-feed-sidebar-note">자녀들의 교실 소식을 한곳에서 확인하세요.</p>
            <nav className="parent-feed-quick-links" aria-label="바로가기">
              <Link href="/parent/home">자녀별 홈 <span>→</span></Link>
              <Link href="/parent/onboard/match/code">자녀 추가 <span>→</span></Link>
              <Link href="/parent/account">계정 관리 <span>→</span></Link>
            </nav>
            <small className="parent-feed-readonly">학부모 화면은 읽기 전용입니다.</small>
          </aside>
        </div>
      )}

      <CardDetailModal
        card={selectedPost ? portfolioCardToCardData(selectedPost) : null}
        onClose={() => setOpenPost(null)}
        boardId={selectedPost?.sourceBoard.id}
      />
    </main>
  );
}

export function ParentFeedSkeleton() {
  return (
    <div className="parent-feed-layout" aria-label="피드 불러오는 중" aria-busy="true">
      <div className="parent-feed-stream">
        {[0, 1].map((item) => (
          <div key={item} className="parent-feed-post parent-feed-skeleton">
            <div className="parent-feed-skeleton-head" />
            <div className="parent-feed-skeleton-media" />
            <div className="parent-feed-skeleton-line" />
            <div className="parent-feed-skeleton-line is-short" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ParentPostsError({
  error,
  retry,
}: {
  error: "forbidden" | "load_failed";
  retry: () => void;
}) {
  return (
    <div className="parent-feed-state" role="alert">
      <span aria-hidden>!</span>
      <h2>{error === "forbidden" ? "이 게시물을 볼 권한이 없어요" : "게시물을 불러오지 못했어요"}</h2>
      <p>{error === "forbidden" ? "연결된 자녀 목록을 다시 확인해 주세요." : "네트워크 상태를 확인하고 다시 시도해 주세요."}</p>
      {error === "load_failed" ? <button type="button" onClick={retry}>다시 시도</button> : null}
    </div>
  );
}
