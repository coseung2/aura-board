"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParentPostDTO } from "@/lib/parent-post-dto";
import { parentFetch } from "@/lib/parent-fetch";

type PostsPayload = {
  items: ParentPostDTO[];
  nextCursor: string | null;
};

export function useParentPosts(endpoint: string, paginationEndpoint = endpoint) {
  const [data, setData] = useState<PostsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<"forbidden" | "load_failed" | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    const separator = endpoint.includes("?") ? "&" : "?";
    void parentFetch(`${endpoint}${separator}limit=12`, { signal: controller.signal })
      .then(async (response) => {
        if (!response) return;
        if (!response.ok) {
          setError(response.status === 403 ? "forbidden" : "load_failed");
          return;
        }
        setData((await response.json()) as PostsPayload);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("load_failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [endpoint, retryKey]);

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await parentFetch(
        `${paginationEndpoint}${paginationEndpoint.includes("?") ? "&" : "?"}limit=12&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      if (!response) return;
      if (!response.ok) throw new Error(`status ${response.status}`);
      const next = (await response.json()) as PostsPayload;
      setData((current) =>
        current
          ? {
              ...next,
              items: [
                ...current.items,
                ...next.items.filter(
                  (item) => !current.items.some((existing) => existing.id === item.id),
                ),
              ],
            }
          : next,
      );
    } catch (caught) {
      console.error("[useParentPosts] load more failed", caught);
    } finally {
      setLoadingMore(false);
    }
  }, [data, loadingMore, paginationEndpoint]);

  return {
    data,
    error,
    loading,
    loadingMore,
    loadMore,
    retry: () => setRetryKey((key) => key + 1),
  };
}
