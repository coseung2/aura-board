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
  const inflightRef = useRef<Promise<void> | null>(null);

  const refetch = useCallback(() => {
    if (inflightRef.current) return inflightRef.current;

    const request = (async () => {
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
      setCards(() => {
        return data.cards.filter(
          (c) => !deletingIds.current.has(c.id),
        );
      });
      if (data.sections && setSections) {
        setSections([...data.sections].sort(sortSections));
      }
      } catch {
        // Transient — next broadcast will retry.
      }
    })().finally(() => {
      if (inflightRef.current === request) inflightRef.current = null;
    });

    inflightRef.current = request;
    return request;
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
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              void refetch();
            }
          });
      } catch {
        // Subscription failure — non-fatal.
      }
    })();

    function catchUpWhenVisible() {
      if (!document.hidden) {
        void refetch();
      }
    }

    function catchUpOnNetworkRestore() {
      void refetch();
    }

    window.addEventListener("online", catchUpOnNetworkRestore);
    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("online", catchUpOnNetworkRestore);
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);
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
