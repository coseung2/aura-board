"use client";

import { useEffect, useRef } from "react";
import type { CardData } from "@/components/DraggableCard";

const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * Polls /api/boards/:id/snapshot at a fixed interval and merges server
 * cards into local state. Uses hash-based 304 to skip unchanged payloads.
 *
 * @param boardId     Board ID to poll.
 * @param setCards    State setter for cards.
 * @param deletingIds Ref to a Set of card IDs being actively deleted
 *                    (prevents deleted cards from resurrecting mid-poll).
 * @param intervalMs  Poll interval (default 5 s).
 */
export function useCardPolling(
  boardId: string,
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>,
  deletingIds: React.RefObject<Set<string>>,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
) {
  const lastHashRef = useRef("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (stopped) return;
      try {
        const qs = lastHashRef.current
          ? `?hash=${encodeURIComponent(lastHashRef.current)}`
          : "";
        const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
          cache: "no-store",
        });
        if (stopped) return;
        if (res.status === 304) return;
        if (res.status === 401 || res.status === 403) {
          stopped = true;
          return;
        }
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
          // Preserve any locally-added cards not yet in the snapshot.
          const serverIds = new Set(next.map((c) => c.id));
          for (const lc of prev) {
            if (!serverIds.has(lc.id) && !deletingIds.current.has(lc.id)) {
              next.push(lc);
            }
          }
          return next;
        });
      } catch {
        // Transient network errors — next interval will retry.
      }
    }

    timer = setTimeout(poll, 1500);
    const interval = setInterval(poll, intervalMs);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
    };
  }, [boardId, setCards, deletingIds, intervalMs]);
}
