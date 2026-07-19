"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export type BoardSnapshot = {
  hash?: string;
  [key: string]: unknown;
};

/**
 * Subscribes to the Supabase Realtime broadcast channel `board:{boardId}` for
 * the given event(s) and refetches `/api/boards/:id/snapshot` on initial mount
 * and on every broadcast. Refetches are de-duplicated in-flight (concurrent
 * broadcasts coalesce into one request) and conditional via the snapshot
 * `hash` query param.
 *
 * The caller supplies an `apply` callback that merges a fetched snapshot into
 * local component state; the hook owns only the subscription + fetch loop.
 *
 * Degrades silently when Supabase env vars are not configured or subscription
 * fails: the mount refetch still runs, so the board renders from a snapshot
 * even without realtime.
 *
 * @param boardId Board ID to listen on.
 * @param events  Broadcast event names to react to (e.g. ["queue_changed"]).
 * @param apply   Receives the parsed snapshot JSON; merge into local state.
 */
export function useBoardSnapshotRealtime(
  boardId: string,
  events: string[],
  apply: (data: BoardSnapshot) => void,
) {
  const lastHashRef = useRef("");
  const inflightRef = useRef<Promise<void> | null>(null);
  const stoppedRef = useRef(false);
  const boardIdRef = useRef(boardId);
  const generationRef = useRef(0);
  boardIdRef.current = boardId;

  // Keep latest callbacks without resubscribing on every render.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const refetch = useCallback(() => {
    if (stoppedRef.current) return Promise.resolve();
    if (inflightRef.current) return inflightRef.current;

    const requestGeneration = generationRef.current;

    const request = (async () => {
      try {
        const qs = lastHashRef.current
          ? `?hash=${encodeURIComponent(lastHashRef.current)}`
          : "";
        const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403) {
          // Auth lost: stop refetching so broadcasts don't hammer a 401.
          if (
            boardIdRef.current === boardId &&
            generationRef.current === requestGeneration
          ) {
            stoppedRef.current = true;
          }
          return;
        }
        if (res.status === 304) return;
        if (!res.ok) return;
        const data = (await res.json()) as BoardSnapshot;
        if (
          stoppedRef.current ||
          boardIdRef.current !== boardId ||
          generationRef.current !== requestGeneration
        ) {
          return;
        }
        lastHashRef.current = data.hash ?? "";
        applyRef.current(data);
      } catch {
        // Transient; next broadcast retries.
      }
    })().finally(() => {
      if (inflightRef.current === request) inflightRef.current = null;
    });

    inflightRef.current = request;
    return request;
  }, [boardId]);

  const eventsKey = JSON.stringify(events);
  useEffect(() => {
    generationRef.current += 1;
    stoppedRef.current = false;
    lastHashRef.current = "";
    return () => {
      // Invalidate responses from the previous board/event generation and
      // prevent a post-unmount refresh from updating caller-owned state.
      stoppedRef.current = true;
      generationRef.current += 1;
      inflightRef.current = null;
    };
  }, [boardId, eventsKey]);

  useRealtimeInvalidation({
    channelName: `board:${boardId}`,
    event: events,
    refresh: refetch,
    fallbackPollMs: 30_000,
  });
}
