"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import { parentFetch } from "@/lib/parent-fetch";
import { CardDetailModal } from "../cards/CardDetailModal";
import { ParentFeedPost } from "./ParentFeedPost";
import { portfolioCardToCardData } from "./portfolio-card-adapter";

type Props = {
  childId: string;
  childName: string;
  childNumber: number | null;
  classroomName: string;
};

type Payload = {
  child: {
    id: string;
    name: string;
    number: number | null;
    classroomId: string;
    classroomName: string;
  };
  items: PortfolioCardDTO[];
  nextCursor: string | null;
};

export function ParentPortfolioView({
  childId,
  childName,
  childNumber,
  classroomName,
}: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<"forbidden" | "load_failed" | null>(null);
  const [openCard, setOpenCard] = useState<PortfolioCardDTO | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setOpenCard(null);

    void parentFetch(
      `/api/parent/feed?childId=${encodeURIComponent(childId)}&limit=12`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response) return;
        if (!response.ok) {
          setError(response.status === 403 ? "forbidden" : "load_failed");
          return;
        }
        setData((await response.json()) as Payload);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("load_failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [childId, retryKey]);

  async function loadMore() {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await parentFetch(
        `/api/parent/feed?childId=${encodeURIComponent(childId)}&limit=12&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      if (!response) return;
      if (!response.ok) throw new Error(`status ${response.status}`);
      const next = (await response.json()) as Payload;
      setData((current) => current ? {
        ...next,
        items: [...current.items, ...next.items.filter(
          (item) => !current.items.some((existing) => existing.id === item.id),
        )],
      } : next);
    } catch (caught) {
      console.error("[ParentPortfolioView] load more failed", caught);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <ParentFeedSkeleton />;

  if (error) {
    return (
      <div className="parent-feed-state" role="alert">
        <span aria-hidden>{error === "forbidden" ? "🔒" : "☁️"}</span>
        <h2>{error === "forbidden" ? "자녀 정보를 볼 권한이 없어요" : "피드를 불러오지 못했어요"}</h2>
        <p>{error === "forbidden" ? "연결된 자녀 목록에서 다시 선택해 주세요." : "네트워크 상태를 확인하고 다시 시도해 주세요."}</p>
        {error === "load_failed" ? (
          <button type="button" onClick={() => setRetryKey((key) => key + 1)}>다시 시도</button>
        ) : null}
      </div>
    );
  }

  if (!data) return null;

  const selectedCard = openCard
    ? data.items.find((card) => card.id === openCard.id) ?? openCard
    : null;

  return (
    <div className="parent-feed-layout">
      <section className="parent-feed-stream" aria-label={`${childName}의 게시물 피드`}>
        <div className="parent-feed-mobile-summary">
          <span className="parent-feed-profile-avatar" aria-hidden>{childName.slice(0, 1)}</span>
          <div>
            <strong>{childName}</strong>
            <span>{classroomName}{childNumber != null ? ` · ${childNumber}번` : ""}</span>
          </div>
          <b>{data.items.length}<small>게시물</small></b>
        </div>

        {data.items.length === 0 ? (
          <div className="parent-feed-empty">
            <span aria-hidden>📷</span>
            <h2>아직 게시물이 없어요</h2>
            <p>교실에서 만든 작품과 활동 기록이 생기면 이곳에 최신순으로 보여드려요.</p>
          </div>
        ) : (
          data.items.map((card) => (
            <ParentFeedPost key={card.id} card={card} childName={childName} onOpen={setOpenCard} />
          ))
        )}

        {data.nextCursor ? (
          <button type="button" className="parent-feed-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "불러오는 중..." : "이전 게시물 더 보기"}
          </button>
        ) : data.items.length > 0 ? (
          <p className="parent-feed-end">모든 게시물을 확인했어요</p>
        ) : null}
      </section>

      <aside className="parent-feed-sidebar-panel">
        <div className="parent-feed-profile-card">
          <span className="parent-feed-profile-avatar" aria-hidden>{childName.slice(0, 1)}</span>
          <div>
            <strong>{childName}</strong>
            <span>{classroomName}{childNumber != null ? ` · ${childNumber}번` : ""}</span>
          </div>
        </div>
        <div className="parent-feed-stat">
          <strong>{data.items.length}{data.nextCursor ? "+" : ""}</strong>
          <span>게시물</span>
        </div>
        <p className="parent-feed-sidebar-note">
          자녀가 직접 또는 친구와 함께 만든 교실 게시물을 최신순으로 모았어요.
        </p>
        <nav className="parent-feed-quick-links" aria-label="빠른 메뉴">
          <Link href="/parent/notifications">알림 확인 <span>›</span></Link>
          <Link href="/parent/onboard/match/code">자녀 추가 <span>›</span></Link>
          <Link href="/parent/account">계정 관리 <span>›</span></Link>
        </nav>
        <small className="parent-feed-readonly">학부모 피드는 읽기 전용입니다.</small>
      </aside>

      <CardDetailModal
        card={selectedCard ? portfolioCardToCardData(selectedCard) : null}
        onClose={() => setOpenCard(null)}
        boardId={selectedCard?.sourceBoard.id}
      />
    </div>
  );
}

function ParentFeedSkeleton() {
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
