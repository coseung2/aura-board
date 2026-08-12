import { useCallback, useEffect, useState } from "react";
import { ApiError, parentApiFetch } from "../lib/api";
import {
  PARENT_OVERVIEW_CACHE_KEY,
  PARENT_POST_COLLECTION_CACHE_PREFIX,
  PARENT_READING_CACHE_KEY,
  PARENT_WALKING_CACHE_KEY,
  readParentDataCache,
  removeParentDataCache,
  removeParentDataCacheByPrefix,
  revalidateParentDataCache,
  writeParentDataCache,
} from "../lib/parent-data-cache";
import { removeParentLinkFromOverview } from "../lib/parent-overview-state";
import { isParentLogoutInProgress } from "../lib/session";
import type {
  ParentChild,
  ParentChildrenResponse,
  ParentPendingLink,
} from "../lib/types";

type ParentProfile = ParentChildrenResponse["parent"];

function initialOverview(): ParentChildrenResponse | null {
  return readParentDataCache<ParentChildrenResponse>(
    PARENT_OVERVIEW_CACHE_KEY,
    { kind: "overview" },
  )?.data ?? null;
}

export function useParentOverview(onUnauthorized: () => void | Promise<void>) {
  const initial = initialOverview();
  const [parent, setParent] = useState<ParentProfile | null>(initial?.parent ?? null);
  const [children, setChildren] = useState<ParentChild[]>(initial?.children ?? []);
  const [pendingLinks, setPendingLinks] = useState<ParentPendingLink[]>(
    initial?.pendingLinks ?? [],
  );
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyOverview = useCallback((response: ParentChildrenResponse) => {
    setParent(response.parent);
    setChildren(response.children);
    setPendingLinks(response.pendingLinks);
  }, []);

  const load = useCallback(async (refresh = false) => {
    const cached = readParentDataCache<ParentChildrenResponse>(
      PARENT_OVERVIEW_CACHE_KEY,
      { kind: "overview" },
    );
    if (cached) {
      applyOverview(cached.data);
      setLoading(false);
    } else if (!refresh) {
      setLoading(true);
    }
    if (refresh) setRefreshing(true);

    try {
      await revalidateParentDataCache(
        PARENT_OVERVIEW_CACHE_KEY,
        () =>
          parentApiFetch<ParentChildrenResponse>("/api/parent/children", {
            forceRefresh: refresh,
          }),
        { kind: "overview", force: refresh },
      );
      const latest = readParentDataCache<ParentChildrenResponse>(
        PARENT_OVERVIEW_CACHE_KEY,
        { kind: "overview" },
      );
      if (latest) applyOverview(latest.data);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        if (isParentLogoutInProgress()) return;
        await onUnauthorized();
        return;
      }
      setError("학부모 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyOverview, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeLink = useCallback(async (linkId: string) => {
    const cached = readParentDataCache<ParentChildrenResponse>(
      PARENT_OVERVIEW_CACHE_KEY,
      { kind: "overview" },
    )?.data;
    const previous =
      cached ??
      (parent
        ? {
            parent,
            children,
            pendingLinks,
          }
        : null);
    const removedChild = previous?.children.find((child) => child.id === linkId);
    const optimistic = previous
      ? removeParentLinkFromOverview(previous, linkId)
      : null;

    setBusyId(linkId);
    setError(null);
    if (optimistic) {
      applyOverview(optimistic);
      writeParentDataCache(PARENT_OVERVIEW_CACHE_KEY, optimistic, {
        kind: "overview",
      });
    }

    try {
      await parentApiFetch(`/api/parent/my-links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
      });
      if (optimistic) {
        writeParentDataCache(PARENT_OVERVIEW_CACHE_KEY, optimistic, {
          kind: "overview",
        });
      }
      if (removedChild) {
        // Once an active child link is gone, cached child-scoped content must
        // disappear immediately rather than remain visible until revalidation.
        removeParentDataCacheByPrefix(PARENT_POST_COLLECTION_CACHE_PREFIX);
        removeParentDataCache(PARENT_READING_CACHE_KEY);
        removeParentDataCache(PARENT_WALKING_CACHE_KEY);
      }
      return true;
    } catch (cause) {
      if (previous) {
        applyOverview(previous);
        writeParentDataCache(PARENT_OVERVIEW_CACHE_KEY, previous, {
          kind: "overview",
        });
      }
      if (cause instanceof ApiError && cause.status === 401) {
        if (isParentLogoutInProgress()) return false;
        await onUnauthorized();
        return false;
      }
      setError("처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setBusyId(null);
    }
  }, [applyOverview, children, onUnauthorized, parent, pendingLinks]);

  return {
    parent,
    children,
    pendingLinks,
    loading,
    refreshing,
    busyId,
    error,
    reload: () => load(true),
    removeLink,
  };
}
