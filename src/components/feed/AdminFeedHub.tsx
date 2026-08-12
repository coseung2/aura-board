"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedItem, FeedPage } from "@/lib/feed/types";
import { FeedComposer, type FeedDraft } from "./FeedComposer";
import { FeedList } from "./FeedList";

function responseError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    if (body.error === "invalid_media") return "YouTube 주소 또는 미디어 정보를 확인해 주세요.";
    if (body.error === "invalid_payload") return "게시물 내용을 확인해 주세요.";
    if (body.error === "forbidden") return "관리자 권한을 확인해 주세요.";
  }
  return fallback;
}

export function AdminFeedHub() {
  const [publishGlobal, setPublishGlobal] = useState(true);
  const [addToPool, setAddToPool] = useState(true);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadGlobalFeed = useCallback(async (cursor?: string | null) => {
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: "global", limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/teacher/feed?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json().catch(() => null)) as FeedPage | { error?: string } | null;
      if (!response.ok || !body || !("items" in body)) {
        throw new Error(responseError(body, "전체 피드를 불러오지 못했어요."));
      }
      setItems((current) => append ? [...current, ...body.items] : body.items);
      setNextCursor(body.nextCursor);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "전체 피드를 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadGlobalFeed();
  }, [loadGlobalFeed]);

  async function createPost(draft: FeedDraft) {
    setSuccess(null);
    const response = await fetch("/api/admin/feed/posts", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...draft, publishGlobal, addToPool }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(responseError(body, "공식 게시물을 저장하지 못했어요."));

    const destinations = [publishGlobal ? "전체 피드" : null, addToPool ? "공유 풀" : null].filter(Boolean);
    setSuccess(destinations.length ? `${destinations.join(" · ")}에 반영했어요.` : "초안으로 저장했어요.");
    if (publishGlobal) await loadGlobalFeed();
  }

  return (
    <section className="ab-feed-shell" aria-label="관리자 공식 피드">
      <div className="ab-feed-pool-targets">
        <div>
          <h2>게시 위치</h2>
          <p>전체 공개와 교사용 공유 풀을 한 번에 선택할 수 있습니다.</p>
        </div>
        <div className="ab-feed-classroom-checks">
          <label>
            <input type="checkbox" checked={publishGlobal} onChange={(event) => setPublishGlobal(event.target.checked)} />
            <span>전체 피드에 게시</span>
          </label>
          <label>
            <input type="checkbox" checked={addToPool} onChange={(event) => setAddToPool(event.target.checked)} />
            <span>교사 공유 풀에 추가</span>
          </label>
        </div>
      </div>

      <FeedComposer
        heading="Aura 공식 게시물"
        description="학생 전체 피드와 교사용 공유 풀에 사용할 공식 콘텐츠를 작성합니다."
        submitLabel="공식 게시물 저장"
        onSubmit={createPost}
      />
      {success ? <p className="ab-feed-success" role="status">{success}</p> : null}

      <div className="ab-feed-global-note">현재 학생들에게 공개 중인 전체 피드입니다.</div>
      <FeedList
        items={items}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        nextCursor={nextCursor}
        emptyMessage="아직 전체 공개 게시물이 없어요."
        onRetry={() => void loadGlobalFeed()}
        onLoadMore={() => void loadGlobalFeed(nextCursor)}
      />
    </section>
  );
}
