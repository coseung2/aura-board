"use client";

import { useEffect, type MutableRefObject } from "react";
import type { CardData } from "../DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import type { StreamActivityTemplateState } from "@/lib/stream-activity-templates";

export type StreamSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  accessToken?: string | null;
  sortMode?: string | null;
  assignmentPublishedAt?: string | null;
  assignmentReminderSentAt?: string | null;
  activityTemplate?: string | null;
  activityTemplateState?: StreamActivityTemplateState | null;
};

type Options = {
  boardId: string;
  pendingCardIds: MutableRefObject<Set<string>>;
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  setSections: React.Dispatch<React.SetStateAction<StreamSection[]>>;
};

export function useBoardStream({
  boardId,
  pendingCardIds,
  setCards,
  setSections,
}: Options) {
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let retryCount = 0;
    let lastHash = "";
    let inflight: Promise<void> | null = null;

    function scheduleRetry(delayMs?: number) {
      if (stopped || retryTimer) return;
      const backoff = Math.min(60_000, 5_000 * 2 ** retryCount);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void refresh();
      }, delayMs ?? backoff);
    }

    function refresh(): Promise<void> {
      if (inflight) return inflight;

      const request = (async () => {
        if (stopped) return;
        try {
          const qs = lastHash ? `?hash=${encodeURIComponent(lastHash)}` : "";
          const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
            cache: "no-store",
          });
          if (res.status === 304) {
            retryCount = 0;
            return;
          }
          if (res.status === 401 || res.status === 403) {
            stopped = true;
            return;
          }
          if (!res.ok) {
            retryCount += 1;
            scheduleRetry();
            return;
          }

          const data = (await res.json()) as {
            cards: CardData[];
            sections: StreamSection[];
            hash?: string;
          };
          retryCount = 0;
          lastHash = data.hash ?? "";
          mergeCards(data.cards);
          mergeSections(data.sections);
        } catch (e) {
          console.error("[board snapshot refresh]", e);
          retryCount += 1;
          scheduleRetry();
        }
      })().finally(() => {
        if (inflight === request) inflight = null;
      });

      inflight = request;
      return request;
    }

    function mergeCards(serverCards: CardData[]) {
      setCards((local) => {
        const localById = new Map(local.map((c) => [c.id, c] as const));
        const next: CardData[] = [];
        for (const sc of serverCards) {
          if (pendingCardIds.current.has(sc.id)) {
            const localCopy = localById.get(sc.id);
            if (localCopy) next.push(localCopy);
            else next.push(sc);
          } else {
            next.push(sc);
          }
        }
        for (const lc of local) {
          if (
            pendingCardIds.current.has(lc.id) &&
            !serverCards.some((sc) => sc.id === lc.id)
          ) {
            next.push(lc);
          }
        }
        return next;
      });
    }

    function mergeSections(serverSections: StreamSection[]) {
      setSections(() =>
        [...serverSections].sort(sortSections)
      );
    }

    let supabase: any = null;
    let channel: any = null;
    let cancelled = false;

    (async () => {
      try {
        const { createPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
        channel = supabase
          .channel(`board:${boardId}`)
          .on("broadcast", { event: "card_changed" }, () => {
            void refresh();
          })
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              void refresh();
            }
          });
      } catch {
        // Supabase is optional. Snapshot refresh still works on mount.
      }
    })();

    function catchUpWhenVisible() {
      if (!document.hidden) {
        void refresh();
      }
    }

    function catchUpOnNetworkRestore() {
      void refresh();
    }

    window.addEventListener("online", catchUpOnNetworkRestore);
    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);

    // The initial snapshot makes the board useful before Realtime finishes
    // subscribing. Later snapshots are driven by broadcast or catch-up.
    void refresh();

    return () => {
      stopped = true;
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
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
    // boardId is the only stable dependency; merges read refs via closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);
}
