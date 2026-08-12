import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, parentApiFetch } from "../lib/api";
import {
  parentPostCollectionCacheKey,
  readParentDataCache,
  revalidateParentDataCache,
  writeParentDataCache,
} from "../lib/parent-data-cache";
import { isParentLogoutInProgress } from "../lib/session";
import type {
  ParentFeedItem,
  ParentFeedResponse,
  ParentPostCounts,
  ParentPostDTO,
} from "../lib/types";

const PAGE_SIZE = 10;

type Options = {
  onUnauthorized: () => void | Promise<void>;
};

export function useParentFeed({ onUnauthorized }: Options) {
  return useParentPostCollection<ParentFeedItem>({
    endpoint: "/api/parent/feed",
    onUnauthorized,
  });
}

type CollectionOptions = {
  endpoint: string | null;
  onUnauthorized: () => void | Promise<void>;
  includeCounts?: boolean;
};

type ParentPostCollectionResult<T extends ParentFeedItem = ParentPostDTO> = {
  items: T[];
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

type ParentPostCollectionWithCounts<
  T extends ParentFeedItem = ParentPostDTO,
> = ParentPostCollectionResult<T> & {
  total: number;
  counts: ParentPostCounts;
};

function readCollection<T extends ParentFeedItem>(
  endpoint: string | null,
): ParentFeedResponse<T> | null {
  if (!endpoint) return null;
  return (
    readParentDataCache<ParentFeedResponse<T>>(
      parentPostCollectionCacheKey(endpoint),
      { kind: "feed" },
    )?.data ?? null
  );
}

export function useParentPostCollection<
  T extends ParentFeedItem = ParentPostDTO,
>(
  options: CollectionOptions & { includeCounts: true },
): ParentPostCollectionWithCounts<T>;
export function useParentPostCollection<
  T extends ParentFeedItem = ParentPostDTO,
>(
  options: CollectionOptions,
): ParentPostCollectionResult<T>;
export function useParentPostCollection<
  T extends ParentFeedItem = ParentPostDTO,
>({
  endpoint,
  onUnauthorized,
  includeCounts = false,
}: CollectionOptions): ParentPostCollectionResult<T> {
  const initial = readCollection<T>(endpoint);
  const [items, setItems] = useState<T[]>(initial?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial?.nextCursor ?? null,
  );
  const [loading, setLoading] = useState(Boolean(endpoint) && !initial);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [counts, setCounts] = useState<ParentPostCounts>(
    initial?.counts ?? { media: 0, text: 0 },
  );
  const requestVersion = useRef(0);

  const applyCollection = useCallback(
    (response: ParentFeedResponse<T>) => {
      setItems(response.items);
      setNextCursor(response.nextCursor);
      if (includeCounts) {
        setTotal(response.total ?? 0);
        setCounts(response.counts ?? { media: 0, text: 0 });
      }
    },
    [includeCounts],
  );

  const loadFirstPage = useCallback(
    async (asRefresh: boolean) => {
      const version = ++requestVersion.current;
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

      const cacheKey = parentPostCollectionCacheKey(endpoint);
      const cached = readParentDataCache<ParentFeedResponse<T>>(cacheKey, {
        kind: "feed",
      });
      if (cached) {
        applyCollection(cached.data);
        setLoading(false);
      } else if (!asRefresh) {
        setItems([]);
        setNextCursor(null);
        setLoadMoreError(null);
        setLoading(true);
        if (includeCounts) {
          setTotal(0);
          setCounts({ media: 0, text: 0 });
        }
      }
      if (asRefresh) setRefreshing(true);

      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        await revalidateParentDataCache(
          cacheKey,
          () =>
            parentApiFetch<ParentFeedResponse<T>>(
              `${endpoint}${separator}limit=${PAGE_SIZE}`,
              { forceRefresh: asRefresh },
            ),
          { kind: "feed", force: asRefresh },
        );
        if (version !== requestVersion.current) return;
        const latest = readParentDataCache<ParentFeedResponse<T>>(cacheKey, {
          kind: "feed",
        });
        if (latest) applyCollection(latest.data);
        setError(null);
      } catch (cause) {
        if (version !== requestVersion.current) return;
        if (cause instanceof ApiError && cause.status === 401) {
          if (isParentLogoutInProgress()) return;
          await onUnauthorized();
          return;
        }
        if (!cached) {
          setItems([]);
          setNextCursor(null);
          if (includeCounts) {
            setTotal(0);
            setCounts({ media: 0, text: 0 });
          }
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
    [applyCollection, endpoint, includeCounts, onUnauthorized],
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
    const cacheKey = parentPostCollectionCacheKey(endpoint);
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const paginationEndpoint = endpoint
        .replace(/([?&])post=[^&]*&?/, "$1")
        .replace(/[?&]$/, "");
      const separator = paginationEndpoint.includes("?") ? "&" : "?";
      const response = await parentApiFetch<ParentFeedResponse<T>>(
        `${paginationEndpoint}${separator}limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (version !== requestVersion.current) return;

      const cached = readParentDataCache<ParentFeedResponse<T>>(cacheKey, {
        kind: "feed",
      })?.data;
      const baseItems = cached?.items ?? items;
      const seen = new Set(baseItems.map((item) => item.id));
      const merged: ParentFeedResponse<T> = {
        items: [
          ...baseItems,
          ...response.items.filter((item) => !seen.has(item.id)),
        ],
        nextCursor: response.nextCursor,
        ...(includeCounts
          ? {
              total: response.total ?? cached?.total ?? total,
              counts: response.counts ?? cached?.counts ?? counts,
            }
          : {}),
      };
      writeParentDataCache(cacheKey, merged, { kind: "feed" });
      applyCollection(merged);
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
    applyCollection,
    counts,
    endpoint,
    includeCounts,
    items,
    loading,
    loadingMore,
    nextCursor,
    onUnauthorized,
    refreshing,
    total,
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
