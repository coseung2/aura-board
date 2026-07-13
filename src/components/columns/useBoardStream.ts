"use client";

import { useEffect, type MutableRefObject } from "react";
import type { CardData } from "../DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import type { StreamActivityTemplateState } from "@/lib/stream-activity-templates";
import type { PublicSupabaseClient } from "@/lib/supabase/client";
import {
  EMPTY_COLUMNS_PRESENCE_SUMMARY,
  type ColumnsPresenceActivity,
  type ColumnsPresenceSummary,
  type ColumnsRealtimeStatus,
} from "@/lib/columns-presence";
import { boardChannelKey } from "@/lib/realtime";

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

type BoardRealtimeChannel = ReturnType<PublicSupabaseClient["channel"]>;

type Options = {
  boardId: string;
  /** Retained for call-site compatibility; general columns boards do not track Presence. */
  currentUserId: string;
  currentRole?: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  activity: ColumnsPresenceActivity;
  pendingCardIds: MutableRefObject<Set<string>>;
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  setSections: React.Dispatch<React.SetStateAction<StreamSection[]>>;
};

type UseBoardStreamResult = {
  status: ColumnsRealtimeStatus;
  presence: ColumnsPresenceSummary;
};

const HIDDEN_PRESENCE_RESULT: UseBoardStreamResult = {
  status: "unavailable",
  presence: EMPTY_COLUMNS_PRESENCE_SUMMARY,
};

/**
 * Keeps a columns board converged through Broadcast plus authoritative snapshot
 * reads. Presence is intentionally excluded from general/duplicated boards, so
 * the game-status collaboration chip is not shown here.
 */
export function useBoardStream({
  boardId,
  isStudentViewer,
  pendingCardIds,
  setCards,
  setSections,
}: Options): UseBoardStreamResult {
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let retryCount = 0;
    let lastHash = "";
    let inflight: Promise<void> | null = null;
    let refreshQueued = false;
    let supabase: PublicSupabaseClient | null = null;
    let channel: BoardRealtimeChannel | null = null;
    let shutdownPromise: Promise<void> | null = null;

    function clearRetryTimer() {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    function shutdownRealtime(): Promise<void> {
      if (shutdownPromise) return shutdownPromise;
      stopped = true;
      refreshQueued = false;
      clearRetryTimer();
      if (broadcastTimer) {
        clearTimeout(broadcastTimer);
        broadcastTimer = null;
      }
      window.removeEventListener("online", catchUpOnNetworkRestore);
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);

      const ownedSupabase = supabase;
      const ownedChannel = channel;
      supabase = null;
      channel = null;
      shutdownPromise = (async () => {
        if (!ownedSupabase || !ownedChannel) return;
        try {
          await ownedSupabase.removeChannel(ownedChannel);
        } catch {
          // Realtime cleanup is best effort.
        }
      })();
      return shutdownPromise;
    }

    function scheduleRetry(delayMs?: number) {
      if (stopped || retryTimer) return;
      const backoff = Math.min(60_000, 5_000 * 2 ** retryCount);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        requestRefresh();
      }, delayMs ?? backoff);
    }

    function requestRefresh(delayMs = 0) {
      if (stopped) return;
      if (delayMs > 0) {
        if (broadcastTimer) clearTimeout(broadcastTimer);
        broadcastTimer = setTimeout(() => {
          broadcastTimer = null;
          requestRefresh();
        }, delayMs);
        return;
      }
      if (broadcastTimer) {
        clearTimeout(broadcastTimer);
        broadcastTimer = null;
      }
      if (inflight) {
        refreshQueued = true;
        return;
      }
      void refresh();
    }

    function refresh(): Promise<void> {
      if (inflight) {
        refreshQueued = true;
        return inflight;
      }

      const request = (async () => {
        if (stopped) return;
        try {
          const qs = lastHash ? `?hash=${encodeURIComponent(lastHash)}` : "";
          const response = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
            cache: "no-store",
            headers: isStudentViewer ? { "x-aura-student-viewer": "1" } : {},
          });
          if (stopped) return;
          if (response.status === 304) {
            retryCount = 0;
            clearRetryTimer();
            return;
          }
          if (response.status === 401 || response.status === 403) {
            void shutdownRealtime();
            return;
          }
          if (!response.ok) {
            retryCount += 1;
            scheduleRetry();
            return;
          }

          const data = (await response.json()) as {
            cards: CardData[];
            sections: StreamSection[];
            hash?: string;
          };
          if (stopped) return;
          retryCount = 0;
          clearRetryTimer();
          lastHash = data.hash ?? "";
          mergeCards(data.cards);
          setSections([...data.sections].sort(sortSections));
        } catch (error) {
          if (stopped) return;
          console.error("[board snapshot refresh]", error);
          retryCount += 1;
          scheduleRetry();
        }
      })().finally(() => {
        if (inflight === request) inflight = null;
        if (refreshQueued && !stopped) {
          refreshQueued = false;
          queueMicrotask(() => requestRefresh());
        }
      });

      inflight = request;
      return request;
    }

    function mergeCards(serverCards: CardData[]) {
      setCards((localCards) => {
        const localById = new Map(
          localCards.map((card) => [card.id, card] as const),
        );
        const next: CardData[] = [];
        const serverIds = new Set(serverCards.map((card) => card.id));

        for (const serverCard of serverCards) {
          next.push(
            pendingCardIds.current.has(serverCard.id)
              ? localById.get(serverCard.id) ?? serverCard
              : serverCard,
          );
        }
        for (const localCard of localCards) {
          if (
            pendingCardIds.current.has(localCard.id) &&
            !serverIds.has(localCard.id)
          ) {
            next.push(localCard);
          }
        }
        return next;
      });
    }

    (async () => {
      try {
        const { createIsolatedPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (stopped) return;
        supabase = createIsolatedPublicSupabaseClient();
        const nextChannel = supabase.channel(boardChannelKey(boardId));
        channel = nextChannel;
        nextChannel
          .on("broadcast", { event: "card_changed" }, () => {
            requestRefresh(80);
          })
          .subscribe((status: string) => {
            if (!stopped && status === "SUBSCRIBED") requestRefresh();
          });
      } catch {
        // Realtime is optional. Initial/focus/online snapshots remain active.
      }
    })();

    function catchUpWhenVisible() {
      if (!document.hidden) requestRefresh();
    }

    function catchUpOnNetworkRestore() {
      requestRefresh();
    }

    window.addEventListener("online", catchUpOnNetworkRestore);
    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);
    requestRefresh();

    return () => {
      void shutdownRealtime();
    };
    // State setters and pendingCardIds are stable refs supplied by the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, isStudentViewer]);

  return HIDDEN_PRESENCE_RESULT;
}
