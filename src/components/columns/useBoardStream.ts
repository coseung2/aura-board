"use client";

import { useEffect, type MutableRefObject } from "react";
import type { CardData } from "../DraggableCard";

export type StreamSection = {
  id: string;
  title: string;
  order: number;
  accessToken?: string | null;
  sortMode?: string | null;
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

    function schedulePoll(delayMs?: number) {
      if (stopped || retryTimer) return;
      const backoff = Math.min(60_000, 5_000 * 2 ** retryCount);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        poll();
      }, delayMs ?? backoff);
    }

    async function poll() {
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
          schedulePoll();
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
        console.error("[board snapshot poll]", e);
        retryCount += 1;
        schedulePoll();
      }
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
        [...serverSections].sort((a, b) => a.order - b.order)
      );
    }

    // Columns boards no longer auto-refresh in the background. We keep a
    // one-time snapshot sync on mount, plus bounded retries for transient
    // load failures, to reduce persistent Vercel function usage.
    poll();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // boardId is the only stable dependency; merges read refs via closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);
}
