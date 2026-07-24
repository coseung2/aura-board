import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, parentApiFetch } from "../lib/api";
import { isParentLogoutInProgress } from "../lib/session";
import type {
  ParentFeedResponse,
  ParentPostCounts,
  ParentPostDTO,
} from "../lib/types";

const PAGE_SIZE = 10;

type Options = {
  onUnauthorized: () => void | Promise<void>;
};

export function useParentFeed({ onUnauthorized }: Options) {
  return useParentPostCollection({ endpoint: "/api/parent/feed", onUnauthorized });
}

type CollectionOptions = {
  endpoint: string | null;
  onUnauthorized: () => void | Promise<void>;
  includeCounts?: boolean;
};

type ParentPostCollectionResult = {
  items: ParentPostDTO[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  loadMore: () => Promise<void>;
};

type ParentPostCollectionWithCounts = ParentPostCollectionResult & {
  total: number;
  counts: ParentPostCounts;
};

export function useParentPostCollection(
  options: CollectionOptions & { includeCounts: true },
): ParentPostCollectionWithCounts;
export function useParentPostCollection(
  options: CollectionOptions,
): ParentPostCollectionResult;
export function useParentPostCollection({
  endpoint,
  onUnauthorized,
  includeCounts = false,
}: CollectionOptions): ParentPostCollectionResult {
  const [items, setItems] = useState<ParentPostDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(endpoint));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<ParentPostCounts>({ media: 0, text: 0 });
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
        if (includeCounts) {
          setTotal(0);
          setCounts({ media: 0, text: 0 });
        }
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
        if (includeCounts) {
          setTotal(0);
          setCounts({ media: 0, text: 0 });
        }
      }

      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        const response = await parentApiFetch<ParentFeedResponse>(
          `${endpoint}${separator}limit=${PAGE_SIZE}`,
        );
        if (version !== requestVersion.current) return;
        setItems(response.items);
        setNextCursor(response.nextCursor);
        if (includeCounts) {
          setTotal(response.total ?? 0);
          setCounts(response.counts ?? { media: 0, text: 0 });
        }
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
        if (includeCounts) {
          setTotal(0);
          setCounts({ media: 0, text: 0 });
        }
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
    [endpoint, includeCounts, onUnauthorized],
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
    ...(includeCounts ? { total, counts } : {}),
  };
}
