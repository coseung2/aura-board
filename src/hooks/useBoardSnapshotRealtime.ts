"use client";

import { useCallback, useRef } from "react";
import { boardChannelKey } from "@/lib/realtime";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export type BoardSnapshot = {
  hash?: string;
  [key: string]: unknown;
};

/**
 * Durable board snapshot transport used by DJ queue and other event-specific
 * board views. Broadcast is the fast invalidation signal; the board snapshot
 * remains authoritative, and slow polling activates only while Realtime is
 * unavailable.
 */
export function useBoardSnapshotRealtime(
  boardId: string,
  events: string[],
  apply: (data: BoardSnapshot) => void,
) {
  const lastHashRef = useRef("");
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const refetch = useCallback(async () => {
    const query = lastHashRef.current
      ? `?hash=${encodeURIComponent(lastHashRef.current)}`
      : "";
    const response = await fetch(`/api/boards/${boardId}/snapshot${query}`, {
      cache: "no-store",
    });
    if (response.status === 304) return;
    if (response.status === 401 || response.status === 403) return;
    if (!response.ok) {
      throw new Error(`board snapshot failed: ${response.status}`);
    }

    const data = (await response.json()) as BoardSnapshot;
    lastHashRef.current = data.hash ?? "";
    applyRef.current(data);
  }, [boardId]);

  useRealtimeInvalidation({
    channelName: boardChannelKey(boardId),
    event: events,
    refresh: refetch,
    debounceMs: 80,
    fallbackPollMs: 30_000,
  });
}
