"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShareBoardWrapper } from "./ShareBoardWrapper";
import { fetchShareBoard, ShareBoardUnavailableError, type ShareBoardPayload } from "@/lib/supabase/share-board";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { boardChannelKey } from "@/lib/realtime";

type Props =
  | { lookupKind: "shortCode"; lookupValue: string }
  | { lookupKind: "shareToken"; lookupValue: string };

export function SupabaseShareBoardClient({ lookupKind, lookupValue }: Props) {
  const [payload, setPayload] = useState<ShareBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const sequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    const sequence = ++sequenceRef.current;
    try {
      const next = await fetchShareBoard({ kind: lookupKind, value: lookupValue });
      if (generation !== generationRef.current || sequence !== sequenceRef.current) return;
      setPayload(next);
      setError(null);
    } catch (error) {
      if (generation !== generationRef.current || sequence !== sequenceRef.current) return;
      if (error instanceof ShareBoardUnavailableError) {
        setPayload(null);
        setError(error.message);
      }
      throw error;
    }
  }, [lookupKind, lookupValue]);

  useEffect(() => {
    generationRef.current += 1;
    setPayload(null);
    setError(null);
    const generation = generationRef.current;
    void refresh().catch((error) => {
      if (generation === generationRef.current) {
        setError(error instanceof Error ? error.message : "공유 보드를 불러오지 못했어요.");
      }
    });
    return () => { generationRef.current += 1; };
  }, [refresh]);

  // Shared with the rendered layout. Unlike a bare postgres_changes listener,
  // this reconciles on focus/reconnect and polls only if Broadcast is down.
  useRealtimeInvalidation({
    channelName: payload ? boardChannelKey(payload.board.id) : "",
    event: ["card_changed", "board_changed"],
    enabled: Boolean(payload),
    refresh,
    debounceMs: 120,
    fallbackPollMs: 30_000,
  });

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createPublicSupabaseClient({ "x-share-token": payload.shareToken });
    const refetch = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!cancelled) void refresh().catch(() => undefined);
      }, 120);
    };
    // Compatibility with already-open legacy pages that still use PostgREST.
    const channel = supabase.channel(`share-board:${payload.board.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "Card", filter: `boardId=eq.${payload.board.id}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "Section", filter: `boardId=eq.${payload.board.id}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "Board", filter: `id=eq.${payload.board.id}` }, refetch)
      .subscribe((status) => { if (status === "SUBSCRIBED") refetch(); });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [payload?.board.id, payload?.shareToken, refresh]);

  if (error && !payload) {
    return (
      <main className="board-page" data-board-theme="pastel-sky">
        <div className="share-board-state" role="alert">{error}</div>
        <button type="button" onClick={() => void refresh().catch(() => undefined)}>다시 시도</button>
      </main>
    );
  }
  if (!payload) {
    return (
      <main className="board-page" data-board-theme="pastel-sky">
        <div className="share-board-state">불러오는 중...</div>
      </main>
    );
  }
  return <ShareBoardWrapper {...payload} />;
}
