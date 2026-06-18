"use client";

import { useEffect, useRef, useCallback } from "react";
import type { CardData } from "@/components/DraggableCard";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

/**
 * Subscribes to Supabase Realtime broadcast channel `board:{boardId}`.
 *
 * When the server broadcasts a `card_changed` event (after any card
 * mutation — insert/update/delete), this hook refetches a single
 * snapshot from /api/boards/:id/snapshot and merges it into local state.
 *
 * No polling — zero Vercel function invocations between changes.
 * The refetch itself hits the snapshot endpoint (NextAuth-authenticated),
 * not Supabase directly, so RLS is irrelevant.
 *
 * If Supabase env vars are missing or the connection fails, the hook
 * silently degrades to no realtime (page still works, just not live).
 *
 * @param boardId     Board ID to listen on.
 * @param setCards    State setter for cards.
 * @param deletingIds Ref to a Set of card IDs being actively deleted.
 */
export function useCardRealtime(
  boardId: string,
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>,
  deletingIds: React.RefObject<Set<string>>,
) {
  const lastHashRef = useRef("");

  const refetch = useCallback(async () => {
    try {
      const qs = lastHashRef.current
        ? `?hash=${encodeURIComponent(lastHashRef.current)}`
        : "";
      const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        cards: CardData[];
        hash?: string;
      };
      lastHashRef.current = data.hash ?? "";
      setCards((prev) => {
        const next = data.cards.filter(
          (c) => !deletingIds.current.has(c.id),
        );
        const serverIds = new Set(next.map((c) => c.id));
        for (const lc of prev) {
          if (!serverIds.has(lc.id) && !deletingIds.current.has(lc.id)) {
            next.push(lc);
          }
        }
        return next;
      });
    } catch {
      // Transient — next broadcast will retry.
    }
  }, [boardId, setCards, deletingIds]);

  useEffect(() => {
    let supabase: ReturnType<typeof createPublicSupabaseClient> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    try {
      supabase = createPublicSupabaseClient();
    } catch {
      // Supabase env vars not configured — realtime disabled, page still works.
      return;
    }

    try {
      channel = supabase
        .channel(`board:${boardId}`)
        .on("broadcast", { event: "card_changed" }, () => {
          void refetch();
        })
        .subscribe();
    } catch {
      // Subscription failure — non-fatal.
      return;
    }

    return () => {
      if (supabase && channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [boardId, refetch]);
}
