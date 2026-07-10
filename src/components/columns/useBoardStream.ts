"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { CardData } from "../DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import type { StreamActivityTemplateState } from "@/lib/stream-activity-templates";
import type { PublicSupabaseClient } from "@/lib/supabase/client";
import {
  buildColumnsPresencePayload,
  EMPTY_COLUMNS_PRESENCE_SUMMARY,
  summarizeColumnsPresence,
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
  currentUserId: string;
  activity: ColumnsPresenceActivity;
  pendingCardIds: MutableRefObject<Set<string>>;
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  setSections: React.Dispatch<React.SetStateAction<StreamSection[]>>;
};

type UseBoardStreamResult = {
  status: ColumnsRealtimeStatus;
  presence: ColumnsPresenceSummary;
};

export function useBoardStream({
  boardId,
  currentUserId,
  activity,
  pendingCardIds,
  setCards,
  setSections,
}: Options): UseBoardStreamResult {
  const [status, setStatus] = useState<ColumnsRealtimeStatus>("connecting");
  const [presence, setPresence] = useState<ColumnsPresenceSummary>(
    EMPTY_COLUMNS_PRESENCE_SUMMARY,
  );
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const requestPresenceTrackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    requestPresenceTrackRef.current?.();
  }, [activity.mode]);

  useEffect(() => {
    setStatus("connecting");
    setPresence(EMPTY_COLUMNS_PRESENCE_SUMMARY);

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
    let presenceTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let retryCount = 0;
    let lastHash = "";
    let inflight: Promise<void> | null = null;
    let refreshQueued = false;
    let supabase: PublicSupabaseClient | null = null;
    let channel: BoardRealtimeChannel | null = null;
    let subscribed = false;

    const actorKey = getOrCreateActorKey(currentUserId);
    const sessionId = createRandomKey("session");

    function clearRetryTimer() {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
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
        // A broadcast received during a snapshot request must not be dropped.
        // Run one trailing read after the current response settles.
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
          const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
            cache: "no-store",
          });
          if (res.status === 304) {
            retryCount = 0;
            clearRetryTimer();
            return;
          }
          if (res.status === 401 || res.status === 403) {
            stopped = true;
            setStatus("unavailable");
            setPresence(EMPTY_COLUMNS_PRESENCE_SUMMARY);
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
          clearRetryTimer();
          lastHash = data.hash ?? "";
          mergeCards(data.cards);
          mergeSections(data.sections);
        } catch (error) {
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
      setCards((local) => {
        const localById = new Map(local.map((card) => [card.id, card] as const));
        const next: CardData[] = [];
        const serverIds = new Set(serverCards.map((card) => card.id));

        for (const serverCard of serverCards) {
          if (pendingCardIds.current.has(serverCard.id)) {
            next.push(localById.get(serverCard.id) ?? serverCard);
          } else {
            next.push(serverCard);
          }
        }
        for (const localCard of local) {
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

    function mergeSections(serverSections: StreamSection[]) {
      setSections([...serverSections].sort(sortSections));
    }

    function schedulePresenceTrack(delayMs = 120) {
      if (stopped || !channel || !subscribed) return;
      if (presenceTimer) clearTimeout(presenceTimer);
      presenceTimer = setTimeout(() => {
        presenceTimer = null;
        if (stopped || !channel || !subscribed) return;
        const payload = buildColumnsPresencePayload({
          actorKey,
          sessionId,
          activity: activityRef.current,
          visible: !document.hidden,
        });
        void channel.track(payload).catch(() => {
          if (!stopped) setStatus("reconnecting");
        });
      }, delayMs);
    }

    requestPresenceTrackRef.current = () => schedulePresenceTrack();

    (async () => {
      try {
        const { createPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (stopped) return;

        supabase = createPublicSupabaseClient();
        const nextChannel = supabase.channel(boardChannelKey(boardId), {
          config: {
            presence: { key: sessionId },
          },
        });
        channel = nextChannel;

        nextChannel
          .on("broadcast", { event: "card_changed" }, () => {
            // Card reorder currently emits one event per PATCH. Coalesce the
            // burst into one snapshot while retaining a trailing refresh when
            // another event arrives during the request.
            requestRefresh(80);
          })
          .on("presence", { event: "sync" }, () => {
            const state = nextChannel.presenceState() as unknown as Record<
              string,
              unknown
            >;
            setPresence(summarizeColumnsPresence(state, actorKey));
          })
          .subscribe((nextStatus: string) => {
            if (nextStatus === "SUBSCRIBED") {
              subscribed = true;
              setStatus("live");
              schedulePresenceTrack(0);
              requestRefresh();
              return;
            }
            if (
              nextStatus === "CHANNEL_ERROR" ||
              nextStatus === "TIMED_OUT" ||
              nextStatus === "CLOSED"
            ) {
              subscribed = false;
              setPresence(EMPTY_COLUMNS_PRESENCE_SUMMARY);
              if (!stopped) setStatus("reconnecting");
            }
          });
      } catch {
        // Supabase is optional. Snapshot refresh still works on mount/focus.
        if (!stopped) setStatus("unavailable");
      }
    })();

    function catchUpWhenVisible() {
      schedulePresenceTrack(0);
      if (!document.hidden) requestRefresh();
    }

    function catchUpOnNetworkRestore() {
      setStatus((current) =>
        current === "unavailable" ? current : "reconnecting",
      );
      requestRefresh();
    }

    window.addEventListener("online", catchUpOnNetworkRestore);
    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);

    // The initial snapshot makes the board useful before Realtime subscribes.
    requestRefresh();

    return () => {
      stopped = true;
      subscribed = false;
      requestPresenceTrackRef.current = null;
      clearRetryTimer();
      if (broadcastTimer) clearTimeout(broadcastTimer);
      if (presenceTimer) clearTimeout(presenceTimer);
      window.removeEventListener("online", catchUpOnNetworkRestore);
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);
      if (supabase && channel) {
        void channel.untrack().catch(() => undefined);
        void supabase.removeChannel(channel).catch(() => undefined);
      }
    };
    // State setters and pendingCardIds are stable refs supplied by the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, currentUserId]);

  return { status, presence };
}

function getOrCreateActorKey(currentUserId: string): string {
  const storageKey = `aura.columns.presence.actor.${hashScope(
    currentUserId || "guest",
  )}`;
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = createRandomKey("actor");
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return createRandomKey("actor");
  }
}

function createRandomKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}-${uuid}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function hashScope(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
