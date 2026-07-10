import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, parentApiFetch } from "../lib/api";
import type { ParentFeedResponse, PortfolioCardDTO } from "../lib/types";

const PAGE_SIZE = 10;

type ParentFeedChild = ParentFeedResponse["child"];

type Options = {
  childId: string | null;
  onUnauthorized: () => void | Promise<void>;
};

export function useParentFeed({ childId, onUnauthorized }: Options) {
  const [child, setChild] = useState<ParentFeedChild | null>(null);
  const [items, setItems] = useState<PortfolioCardDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(childId));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadFirstPage = useCallback(
    async (asRefresh: boolean) => {
      if (!childId) {
        setChild(null);
        setItems([]);
        setNextCursor(null);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const version = ++requestVersion.current;
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setChild(null);
        setItems([]);
        setNextCursor(null);
        setError(null);
        setLoading(true);
      }

      try {
        const response = await parentApiFetch<ParentFeedResponse>(
          `/api/parent/feed?childId=${encodeURIComponent(childId)}&limit=${PAGE_SIZE}`,
        );
        if (version !== requestVersion.current) return;
        setChild(response.child);
        setItems(response.items);
        setNextCursor(response.nextCursor);
        setError(null);
      } catch (cause) {
        if (version !== requestVersion.current) return;
        if (cause instanceof ApiError && cause.status === 401) {
          await onUnauthorized();
          return;
        }
        setChild(null);
        setItems([]);
        setNextCursor(null);
        setError(
          cause instanceof ApiError && cause.status === 403
            ? "자녀 정보를 볼 권한이 없어요."
            : "게시물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [childId, onUnauthorized],
  );

  useEffect(() => {
    void loadFirstPage(false);
    return () => {
      requestVersion.current += 1;
    };
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!childId || !nextCursor || loading || refreshing || loadingMore) return;
    const version = requestVersion.current;
    const cursor = nextCursor;
    setLoadingMore(true);
    try {
      const response = await parentApiFetch<ParentFeedResponse>(
        `/api/parent/feed?childId=${encodeURIComponent(childId)}&limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (version !== requestVersion.current) return;
      setChild(response.child);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(response.nextCursor);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        await onUnauthorized();
      }
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }, [
    childId,
    loading,
    loadingMore,
    nextCursor,
    onUnauthorized,
    refreshing,
  ]);

  return {
    child,
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    refresh: () => loadFirstPage(true),
    retry: () => loadFirstPage(false),
    loadMore,
  };
}
