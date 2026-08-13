"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ParentPostDTO } from "@/lib/parent-post-dto";
import { parentFetch } from "@/lib/parent-fetch";

type PostsPayload = {
  items: ParentPostDTO[];
  nextCursor: string | null;
};

type CacheEntry = {
  data: PostsPayload;
  fetchedAt: number;
  lastAccessAt: number;
};

const PAGE_SIZE = 12;
const FRESH_FOR_MS = 20_000;
const RETAIN_FOR_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 12;

const postsCache = new Map<string, CacheEntry>();
let cacheGeneration = 0;

function queryKey(endpoint: string, paginationEndpoint: string): string {
  return `${endpoint}\u0000${paginationEndpoint}`;
}

function readCachedPosts(key: string): { data: PostsPayload; isFresh: boolean } | null {
  const entry = postsCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.fetchedAt > RETAIN_FOR_MS) {
    postsCache.delete(key);
    return null;
  }

  entry.lastAccessAt = now;
  return {
    data: entry.data,
    isFresh: now - entry.fetchedAt < FRESH_FOR_MS,
  };
}

function writeCachedPosts(key: string, data: PostsPayload): void {
  const now = Date.now();
  postsCache.set(key, { data, fetchedAt: now, lastAccessAt: now });

  if (postsCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = [...postsCache.entries()].sort(
    ([, left], [, right]) => left.lastAccessAt - right.lastAccessAt,
  );
  for (const [oldestKey] of oldest.slice(0, postsCache.size - MAX_CACHE_ENTRIES)) {
    postsCache.delete(oldestKey);
  }
}

function clearPostsCache(): void {
  cacheGeneration += 1;
  postsCache.clear();
}

// Logout controls dispatch this before leaving the parent app. Keeping the
// listener module-scoped clears cached queries even when no feed hook is
// mounted on the account page where logout was triggered.
if (typeof window !== "undefined") {
  const cacheListenerKey = "__auraParentPostsCacheListener";
  const listenerWindow = window as typeof window & Record<string, unknown>;
  if (!listenerWindow[cacheListenerKey]) {
    window.addEventListener("parent-auth-lost", clearPostsCache);
    listenerWindow[cacheListenerKey] = true;
  }
}

function isAbortError(caught: unknown): boolean {
  return caught instanceof DOMException && caught.name === "AbortError";
}

export function useParentPosts(endpoint: string, paginationEndpoint = endpoint) {
  const key = queryKey(endpoint, paginationEndpoint);
  const initialCache = readCachedPosts(key);
  const [data, setData] = useState<PostsPayload | null>(initialCache?.data ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<"forbidden" | "load_failed" | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestGeneration = useRef(0);
  const loadingMoreRef = useRef(false);
  const firstPageGenerationRef = useRef<number | null>(null);
  const handledRetryKey = useRef(retryKey);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const handleAuthLost = () => {
      requestGeneration.current += 1;
      loadingMoreRef.current = false;
      setData(null);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
    };

    window.addEventListener("parent-auth-lost", handleAuthLost);
    return () => {
      window.removeEventListener("parent-auth-lost", handleAuthLost);
      // Explicit parent logout navigates to the shared login route without
      // dispatching parent-auth-lost. Do not let the old cookie session's
      // memory survive that route boundary into a later login.
      if (window.location.pathname === "/login") clearPostsCache();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    const cacheGenerationAtStart = cacheGeneration;
    const cached = readCachedPosts(key);
    const forceRevalidate = retryKey !== handledRetryKey.current;
    handledRetryKey.current = retryKey;

    firstPageGenerationRef.current = null;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setError(null);
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      // Keep the previous query's data visible during a warm switch.
      setLoading(dataRef.current === null);
    }

    if (cached?.isFresh && !forceRevalidate) {
      return () => controller.abort();
    }

    firstPageGenerationRef.current = generation;
    const separator = endpoint.includes("?") ? "&" : "?";
    void parentFetch(`${endpoint}${separator}limit=${PAGE_SIZE}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response) return;
        if (!response.ok) {
          if (
            generation === requestGeneration.current &&
            cacheGenerationAtStart === cacheGeneration
          ) {
            setError(response.status === 403 ? "forbidden" : "load_failed");
          }
          return;
        }

        const next = (await response.json()) as PostsPayload;
        if (
          generation !== requestGeneration.current ||
          cacheGenerationAtStart !== cacheGeneration
        ) {
          return;
        }
        writeCachedPosts(key, next);
        setData(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (isAbortError(caught)) return;
        if (
          generation === requestGeneration.current &&
          cacheGenerationAtStart === cacheGeneration
        ) {
          setError("load_failed");
        }
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          generation === requestGeneration.current &&
          cacheGenerationAtStart === cacheGeneration
        ) {
          firstPageGenerationRef.current = null;
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [endpoint, key, paginationEndpoint, retryKey]);

  const loadMore = useCallback(async () => {
    if (
      !data?.nextCursor ||
      loadingMoreRef.current ||
      firstPageGenerationRef.current !== null
    ) {
      return;
    }

    const generation = requestGeneration.current;
    const cacheGenerationAtStart = cacheGeneration;
    const cursor = data.nextCursor;
    const currentKey = queryKey(endpoint, paginationEndpoint);
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      const separator = paginationEndpoint.includes("?") ? "&" : "?";
      const response = await parentFetch(
        `${paginationEndpoint}${separator}limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!response) return;
      if (!response.ok) throw new Error(`status ${response.status}`);

      const next = (await response.json()) as PostsPayload;
      if (
        generation !== requestGeneration.current ||
        cacheGenerationAtStart !== cacheGeneration
      ) {
        return;
      }

      const cached = readCachedPosts(currentKey)?.data;
      const base = cached ?? data;
      const seen = new Set(base.items.map((item) => item.id));
      const merged: PostsPayload = {
        items: [
          ...base.items,
          ...next.items.filter((item) => !seen.has(item.id)),
        ],
        nextCursor: next.nextCursor,
      };
      writeCachedPosts(currentKey, merged);
      setData(merged);
    } catch (caught: unknown) {
      if (
        generation === requestGeneration.current &&
        cacheGenerationAtStart === cacheGeneration
      ) {
        setError("load_failed");
      }
      if (isAbortError(caught)) return;
      console.error("[useParentPosts] load more failed", caught);
    } finally {
      if (
        generation === requestGeneration.current &&
        cacheGenerationAtStart === cacheGeneration
      ) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [data, endpoint, paginationEndpoint]);

  return {
    data,
    error,
    loading,
    loadingMore,
    loadMore,
    retry: () => setRetryKey((key) => key + 1),
  };
}
