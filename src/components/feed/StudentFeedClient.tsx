"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem, FeedPage } from "@/lib/feed/types";
import { FeedComposer, type FeedDraft } from "./FeedComposer";
import { FeedList } from "./FeedList";

type Scope = "classroom" | "global";

function responseError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    if (body.error === "invalid_media") return "YouTube 주소 또는 미디어 정보를 확인해 주세요.";
    if (body.error === "invalid_payload") return "게시물 내용을 확인해 주세요.";
  }
  return fallback;
}

export function StudentFeedClient() {
  const [scope, setScope] = useState<Scope>("classroom");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadFeed = useCallback(async (nextScope: Scope, cursor?: string | null) => {
    const append = Boolean(cursor);
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ scope: nextScope, limit: "20" });
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
    void loadFeed(scope);
  }, [loadFeed, scope]);

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
    await loadFeed("classroom");
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

      <div className="ab-feed-tabs" role="tablist" aria-label="피드 범위">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "classroom"}
          className={scope === "classroom" ? "is-active" : ""}
          onClick={() => setScope("classroom")}
        >
          우리 반
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "global"}
          className={scope === "global" ? "is-active" : ""}
          onClick={() => setScope("global")}
        >
          전체
        </button>
      </div>

      {scope === "classroom" ? (
        <FeedComposer
          heading="새 게시물"
          description="이미지와 YouTube 영상도 함께 올릴 수 있어요."
          onSubmit={createPost}
        />
      ) : (
        <div className="ab-feed-global-note">전체 피드는 Aura 공식 소식을 보는 공간이에요.</div>
      )}

      <FeedList
        items={items}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        nextCursor={nextCursor}
        emptyMessage={scope === "classroom" ? "아직 우리 반 게시물이 없어요." : "아직 전체 소식이 없어요."}
        onRetry={() => void loadFeed(scope)}
        onLoadMore={() => void loadFeed(scope, nextCursor)}
      />
    </section>
  );
}
