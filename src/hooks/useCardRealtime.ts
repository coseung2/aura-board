"use client";

import { useCallback, useRef } from "react";
import type { CardData } from "@/components/DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import { boardChannelKey } from "@/lib/realtime";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * Reconciles card-based content boards from a server snapshot.
 *
 * Supabase Broadcast is only an invalidation signal. The authoritative cards
 * and sections are always read from /api/boards/:id/snapshot. When Realtime is
 * unavailable, useRealtimeInvalidation enables a slow visible-tab poll; it
 * also catches up after focus, visibility, and network restoration.
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
  isStudentViewer = false,
) {
  const lastHashRef = useRef("");

  const refetch = useCallback(async () => {
    const qs = lastHashRef.current
      ? `?hash=${encodeURIComponent(lastHashRef.current)}`
      : "";
    const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
      cache: "no-store",
      headers: isStudentViewer ? { "x-aura-student-viewer": "1" } : {},
    });

    if (res.status === 304) return;
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) {
      throw new Error(`board snapshot failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      cards: CardData[];
      sections?: TSection[];
      hash?: string;
    };
    lastHashRef.current = data.hash ?? "";

    setCards(
      data.cards.filter((card) => !deletingIds.current.has(card.id)),
    );
    if (data.sections && setSections) {
      setSections([...data.sections].sort(sortSections));
    }
  }, [boardId, deletingIds, isStudentViewer, setCards, setSections]);

  useRealtimeInvalidation({
    channelName: boardChannelKey(boardId),
    event: "card_changed",
    refresh: refetch,
    debounceMs: 80,
    fallbackPollMs: 30_000,
  });
}
