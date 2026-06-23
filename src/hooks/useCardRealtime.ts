"use client";

import { useEffect, useRef, useCallback } from "react";
import type { CardData } from "@/components/DraggableCard";
import { sortSections } from "@/lib/sort-sections";

/**
 * Subscribes to Supabase Realtime broadcast channel `board:{boardId}`.
 *
 * When the server broadcasts a `card_changed` event (after any card
 * mutation — insert/update/delete), this hook refetches a single
 * snapshot from /api/boards/:id/snapshot and merges it into local state.
 *
 * If Supabase is not configured or connection fails, the hook silently
 * degrades — the page still works, just without realtime updates.
 *
 * @param boardId     Board ID to listen on.
 * @param setCards    State setter for cards.
 * @param deletingIds Ref to a Set of card IDs being actively deleted.
 */
export function useCardRealtime<
  TSection extends { order: number; pinned: boolean } = {
    order: number;
    pinned: boolean;
  },
>(
  boardId: string,
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>,
  deletingIds: React.RefObject<Set<string>>,
  setSections?: React.Dispatch<React.SetStateAction<TSection[]>>,
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
        sections?: TSection[];
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
      if (data.sections && setSections) {
        setSections([...data.sections].sort(sortSections));
      }
    } catch {
      // Transient — next broadcast will retry.
    }
  }, [boardId, setCards, deletingIds, setSections]);

  useEffect(() => {
    // Dynamic import: Supabase 클라이언트를 브라우저에서만 지연 로드.
    // 정적 import는 SSR 단계에서 모듈 평가 에러를 일으킬 수 있음.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabase: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    let cancelled = false;

    (async () => {
      try {
        const { createPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
      } catch {
        // Supabase env vars not configured — realtime disabled.
        return;
      }

      try {
        if (cancelled || !supabase) return;
        channel = supabase
          .channel(`board:${boardId}`)
          .on("broadcast", { event: "card_changed" }, () => {
            void refetch();
          })
          .subscribe();
      } catch {
        // Subscription failure — non-fatal.
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
  }, [boardId, refetch]);
}
