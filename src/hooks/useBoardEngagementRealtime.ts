"use client";

import { useEffect, useRef } from "react";

// Board-level realtime payload for engagement changes. Matches the
// `engagement_changed` variant of the backend BoardRealtimeEvent union.
export type BoardEngagementEvent = {
  type: "engagement_changed";
  boardId: string;
  cardId: string;
  likeCount: number;
  commentCount: number;
  updatedAt: string;
};

type Listener = (event: BoardEngagementEvent) => void;

type BoardEntry = {
  listeners: Map<string, Set<Listener>>;
  started: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel: any;
  remove: () => void;
};

// Module-level singleton: one Supabase channel per boardId, shared by all
// card components on that board. Ref-counted so the channel is removed when
// the last subscriber unmounts. Keeps us from opening a channel per card.
const boards = new Map<string, BoardEntry>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabasePromise: Promise<any> | null = null;

function getSupabase() {
  if (!supabasePromise) {
    supabasePromise = import("@/lib/supabase/client")
      .then((m) => m.createPublicSupabaseClient())
      .catch(() => null);
  }
  return supabasePromise;
}

function dispatch(boardId: string, event: BoardEngagementEvent) {
  const entry = boards.get(boardId);
  if (!entry) return;
  const set = entry.listeners.get(event.cardId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      // listener errors are non-fatal
    }
  }
}

async function startBoard(boardId: string, entry: BoardEntry) {
  if (entry.started) return;
  entry.started = true;
  const supabase = await getSupabase();
  if (!supabase) return;
  if (boards.get(boardId) !== entry) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel(`board:${boardId}`)
      .on(
        "broadcast",
        { event: "board_changed" },
        (msg: { payload?: unknown }) => {
          const payload = msg?.payload as BoardEngagementEvent | undefined;
          if (payload?.type !== "engagement_changed") return;
          if (payload.boardId !== boardId) return;
          dispatch(boardId, payload);
        },
      )
      .subscribe();
    entry.channel = channel;
    entry.remove = () => {
      try {
        void supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  } catch {
    // Subscription failure is non-fatal; counts still load via fetch.
  }
}

function subscribe(
  boardId: string,
  cardId: string,
  listener: Listener,
): () => void {
  let entry = boards.get(boardId);
  if (!entry) {
    entry = {
      listeners: new Map(),
      started: false,
      channel: null,
      remove: () => {},
    };
    boards.set(boardId, entry);
    void startBoard(boardId, entry);
  }
  let set = entry.listeners.get(cardId);
  if (!set) {
    set = new Set();
    entry.listeners.set(cardId, set);
  }
  set.add(listener);
  return () => {
    const e = boards.get(boardId);
    if (!e) return;
    const s = e.listeners.get(cardId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) e.listeners.delete(cardId);
    if (e.listeners.size === 0) {
      e.remove();
      boards.delete(boardId);
    }
  };
}

/**
 * Subscribes a single card to board-level engagement broadcasts on
 * `board:${boardId}`. Calls `onEvent` for each `engagement_changed` event
 * targeting `cardId`. No-op (and non-fatal) when boardId/cardId are missing
 * or Supabase is not configured.
 */
export function useBoardEngagement(
  boardId: string | null | undefined,
  cardId: string | null | undefined,
  onEvent: Listener,
) {
  const ref = useRef<Listener>(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    if (!boardId || !cardId) return;
    const listener: Listener = (e) => ref.current(e);
    return subscribe(boardId, cardId, listener);
  }, [boardId, cardId]);
}
