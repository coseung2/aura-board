"use client";

import { useCallback, useEffect, useRef } from "react";

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
  boardIdRef.current = boardId;

  // Keep latest callbacks without resubscribing on every render.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const refetch = useCallback(() => {
    if (stoppedRef.current) return Promise.resolve();
    if (inflightRef.current) return inflightRef.current;

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
          if (boardIdRef.current === boardId) stoppedRef.current = true;
          return;
        }
        if (res.status === 304) return;
        if (!res.ok) return;
        const data = (await res.json()) as BoardSnapshot;
        if (boardIdRef.current !== boardId) return;
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

  const eventsKey = events.join("|");

  useEffect(() => {
    stoppedRef.current = false;
    lastHashRef.current = "";
    let supabase: ReturnType<
      typeof import("@/lib/supabase/client")["createIsolatedPublicSupabaseClient"]
    > | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    let cancelled = false;

    (async () => {
      // Initial mount snapshot (independent of realtime availability).
      void refetch();

      try {
        const { createIsolatedPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (cancelled) return;
        supabase = createIsolatedPublicSupabaseClient();
      } catch {
        // Supabase env vars not configured: realtime disabled, mount fetch done.
        return;
      }

      if (cancelled || !supabase) return;
      try {
        let ch = supabase.channel(`board:${boardId}`);
        for (const event of eventsRef.current) {
          ch = ch.on("broadcast", { event }, () => {
            void refetch();
          });
        }
        channel = ch.subscribe();
      } catch {
        // Subscription failure: non-fatal.
      }
    })();

    return () => {
      cancelled = true;
      if (supabase && channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [boardId, eventsKey, refetch]);
}
