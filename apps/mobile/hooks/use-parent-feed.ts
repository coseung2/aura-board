import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, parentApiFetch } from "../lib/api";
import { isParentLogoutInProgress } from "../lib/session";
import type { ParentFeedResponse, ParentPostDTO } from "../lib/types";

const PAGE_SIZE = 10;

type Options = {
  focusPostId?: string | null;
  onUnauthorized: () => void | Promise<void>;
};

export function useParentFeed({ focusPostId, onUnauthorized }: Options) {
  const endpoint = `/api/parent/feed${focusPostId ? `?post=${encodeURIComponent(focusPostId)}` : ""}`;
  return useParentPostCollection({ endpoint, onUnauthorized });
}

type CollectionOptions = {
  endpoint: string | null;
  onUnauthorized: () => void | Promise<void>;
};

export function useParentPostCollection({ endpoint, onUnauthorized }: CollectionOptions) {
  const [items, setItems] = useState<ParentPostDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(endpoint));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadFirstPage = useCallback(
    async (asRefresh: boolean) => {
      if (!endpoint) {
        setItems([]);
        setNextCursor(null);
        setError(null);
        setLoadMoreError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const version = ++requestVersion.current;
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setItems([]);
        setNextCursor(null);
        setError(null);
        setLoadMoreError(null);
        setLoading(true);
      }

      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        const response = await parentApiFetch<ParentFeedResponse>(
          `${endpoint}${separator}limit=${PAGE_SIZE}`,
        );
        if (version !== requestVersion.current) return;
        setItems(response.items);
        setNextCursor(response.nextCursor);
        setError(null);
      } catch (cause) {
        if (version !== requestVersion.current) return;
        if (cause instanceof ApiError && cause.status === 401) {
          if (isParentLogoutInProgress()) return;
          await onUnauthorized();
          return;
        }
        setItems([]);
        setNextCursor(null);
        setError(
          cause instanceof ApiError && cause.status === 403
            ? "자녀 정보를 볼 권한이 없어요."
            : cause instanceof ApiError && cause.status === 404
              ? "요청한 게시물을 찾을 수 없어요."
            : "게시물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [endpoint, onUnauthorized],
  );

  useEffect(() => {
    void loadFirstPage(false);
    return () => {
      requestVersion.current += 1;
    };
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!endpoint || !nextCursor || loading || refreshing || loadingMore) return;
    const version = requestVersion.current;
    const cursor = nextCursor;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const paginationEndpoint = endpoint.replace(/([?&])post=[^&]*&?/, "$1").replace(/[?&]$/, "");
      const separator = paginationEndpoint.includes("?") ? "&" : "?";
      const response = await parentApiFetch<ParentFeedResponse>(
        `${paginationEndpoint}${separator}limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (version !== requestVersion.current) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...response.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(response.nextCursor);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      if (cause instanceof ApiError && cause.status === 401) {
        if (isParentLogoutInProgress()) return;
        await onUnauthorized();
      } else {
        setLoadMoreError("게시물을 더 불러오지 못했어요.");
      }
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }, [
    endpoint,
    loading,
    loadingMore,
    nextCursor,
    onUnauthorized,
    refreshing,
  ]);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    loadMoreError,
    error,
    hasMore: Boolean(nextCursor),
    refresh: () => loadFirstPage(true),
    retry: () => loadFirstPage(false),
    loadMore,
  };
}
