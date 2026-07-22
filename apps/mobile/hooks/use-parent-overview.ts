import { useCallback, useEffect, useState } from "react";
import { ApiError, parentApiFetch } from "../lib/api";
import { isParentLogoutInProgress } from "../lib/session";
import type {
  ParentChild,
  ParentChildrenResponse,
  ParentPendingLink,
} from "../lib/types";

type ParentProfile = ParentChildrenResponse["parent"];

export function useParentOverview(onUnauthorized: () => void | Promise<void>) {
  const [parent, setParent] = useState<ParentProfile | null>(null);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [pendingLinks, setPendingLinks] = useState<ParentPendingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await parentApiFetch<ParentChildrenResponse>(
        "/api/parent/children",
      );
      setParent(response.parent);
      setChildren(response.children);
      setPendingLinks(response.pendingLinks);
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
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeLink = useCallback(async (linkId: string) => {
    setBusyId(linkId);
    setError(null);
    try {
      await parentApiFetch(`/api/parent/my-links/${encodeURIComponent(linkId)}`, {
        method: "DELETE",
      });
      setChildren((current) => current.filter((item) => item.id !== linkId));
      setPendingLinks((current) => current.filter((item) => item.id !== linkId));
      return true;
    } catch (cause) {
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
  }, [onUnauthorized]);

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
