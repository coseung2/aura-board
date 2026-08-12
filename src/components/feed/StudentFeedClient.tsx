"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem, FeedPage } from "@/lib/feed/types";
import { FeedComposer, type FeedDraft } from "./FeedComposer";
import { FeedList } from "./FeedList";

function responseError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    if (body.error === "invalid_media") return "YouTube 주소 또는 미디어 정보를 확인해 주세요.";
    if (body.error === "invalid_payload") return "게시물 내용을 확인해 주세요.";
  }
  return fallback;
}

export function StudentFeedClient() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadFeed = useCallback(async (cursor?: string | null) => {
    const append = Boolean(cursor);
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/student/feed?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json().catch(() => null)) as FeedPage | { error?: string } | null;
      if (!response.ok || !body || !("items" in body)) {
        throw new Error(responseError(body, "피드를 불러오지 못했어요."));
      }
      if (requestId !== requestIdRef.current) return;
      setItems((current) => (append ? [...current, ...body.items] : body.items));
      setNextCursor(body.nextCursor);
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return;
      setError(nextError instanceof Error ? nextError.message : "피드를 불러오지 못했어요.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadFeed();
  }, [loadFeed]);

  async function createPost(draft: FeedDraft) {
    const response = await fetch("/api/student/feed", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseError(body, "게시물을 저장하지 못했어요."));
    }
    await loadFeed();
  }

  return (
    <section className="ab-feed-shell" aria-label="학생 피드">
      <header className="ab-feed-hero">
        <div>
          <p className="ab-feed-eyebrow">AURA FEED</p>
          <h1>우리 반 피드</h1>
          <p>우리 반 소식과 Aura 전체 소식을 한곳에서 보고, 직접 이야기도 남겨 보세요.</p>
        </div>
      </header>

      <FeedComposer
        heading="새 게시물"
        description="이미지와 YouTube 영상도 함께 올릴 수 있어요."
        onSubmit={createPost}
      />

      <FeedList
        items={items}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        nextCursor={nextCursor}
        emptyMessage="아직 게시물이 없어요."
        onRetry={() => void loadFeed()}
        onLoadMore={() => void loadFeed(nextCursor)}
      />
    </section>
  );
}
