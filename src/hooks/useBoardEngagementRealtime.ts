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

// comment-area poll (2026-06-28): board-level poll change broadcast.
export type BoardPollEvent = {
  type: "poll_changed";
  boardId: string;
  cardId: string;
  updatedAt: string;
};

export type BoardRealtimeEvent = BoardEngagementEvent | BoardPollEvent;

type EngagementListener = (event: BoardEngagementEvent) => void;
type PollListener = (event: BoardPollEvent) => void;

type BoardEntry = {
  engagementListeners: Map<string, Set<EngagementListener>>;
  pollListeners: Map<string, Set<PollListener>>;
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

function dispatch(boardId: string, event: BoardRealtimeEvent) {
  const entry = boards.get(boardId);
  if (!entry) return;
  if (event.type === "engagement_changed") {
    const set = entry.engagementListeners.get(event.cardId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  } else if (event.type === "poll_changed") {
    const set = entry.pollListeners.get(event.cardId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch {
        // listener errors are non-fatal
      }
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
          const payload = msg?.payload as BoardRealtimeEvent | undefined;
          if (!payload) return;
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

function subscribeEngagement(
  boardId: string,
  cardId: string,
  listener: EngagementListener,
): () => void {
  let entry = boards.get(boardId);
  if (!entry) {
    entry = {
      engagementListeners: new Map(),
      pollListeners: new Map(),
      started: false,
      channel: null,
      remove: () => {},
    };
    boards.set(boardId, entry);
    void startBoard(boardId, entry);
  }
  let set = entry.engagementListeners.get(cardId);
  if (!set) {
    set = new Set();
    entry.engagementListeners.set(cardId, set);
  }
  set.add(listener);
  return () => {
    const e = boards.get(boardId);
    if (!e) return;
    const s = e.engagementListeners.get(cardId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) e.engagementListeners.delete(cardId);
    if (e.engagementListeners.size === 0 && e.pollListeners.size === 0) {
      e.remove();
      boards.delete(boardId);
    }
  };
}

function subscribePoll(
  boardId: string,
  cardId: string,
  listener: PollListener,
): () => void {
  let entry = boards.get(boardId);
  if (!entry) {
    entry = {
      engagementListeners: new Map(),
      pollListeners: new Map(),
      started: false,
      channel: null,
      remove: () => {},
    };
    boards.set(boardId, entry);
    void startBoard(boardId, entry);
  }
  let set = entry.pollListeners.get(cardId);
  if (!set) {
    set = new Set();
    entry.pollListeners.set(cardId, set);
  }
  set.add(listener);
  return () => {
    const e = boards.get(boardId);
    if (!e) return;
    const s = e.pollListeners.get(cardId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) e.pollListeners.delete(cardId);
    if (e.engagementListeners.size === 0 && e.pollListeners.size === 0) {
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
  onEvent: EngagementListener,
) {
  const ref = useRef<EngagementListener>(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    if (!boardId || !cardId) return;
    const listener: EngagementListener = (e) => ref.current(e);
    return subscribeEngagement(boardId, cardId, listener);
  }, [boardId, cardId]);
}

/**
 * Subscribes a single card to board-level poll broadcasts on
 * `board:${boardId}`. Calls `onEvent` for each `poll_changed` event
 * targeting `cardId`. No-op (and non-fatal) when boardId/cardId are missing
 * or Supabase is not configured.
 */
export function useBoardPollChange(
  boardId: string | null | undefined,
  cardId: string | null | undefined,
  onEvent: PollListener,
) {
  const ref = useRef<PollListener>(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    if (!boardId || !cardId) return;
    const listener: PollListener = (e) => ref.current(e);
    return subscribePoll(boardId, cardId, listener);
  }, [boardId, cardId]);
}
