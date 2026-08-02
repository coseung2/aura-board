"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShadowAllianceSnapshot } from "@/lib/shadow-alliance/contracts";

/**
 * Read-only authoritative snapshot adapter.
 *
 * Mutations intentionally live in the board component/API command boundary so
 * browser storage and peer broadcasts can never become game authority again.
 */
export function useShadowAllianceGame(boardId: string) {
  const [snapshot, setSnapshot] = useState<ShadowAllianceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const response = await fetch(
        `/api/shadow-alliance/boards/${encodeURIComponent(boardId)}`,
        { cache: "no-store", headers: { accept: "application/json" } },
      );
      const body = (await response.json().catch(() => null)) as
        | { snapshot?: ShadowAllianceSnapshot; error?: string }
        | null;
      if (requestId !== requestRef.current) return null;
      if (!response.ok || !body?.snapshot) {
        setError(body?.error ?? "snapshot_unavailable");
        return null;
      }
      setSnapshot(body.snapshot);
      setError(null);
      return body.snapshot;
    } catch {
      if (requestId === requestRef.current) setError("network_error");
      return null;
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_500);
    return () => {
      requestRef.current += 1;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
