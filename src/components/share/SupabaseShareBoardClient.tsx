"use client";

import { useEffect, useState } from "react";
import { ShareBoardWrapper } from "./ShareBoardWrapper";
import {
  fetchShareBoard,
  type ShareBoardPayload,
} from "@/lib/supabase/share-board";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type Props =
  | { lookupKind: "shortCode"; lookupValue: string }
  | { lookupKind: "shareToken"; lookupValue: string };

export function SupabaseShareBoardClient({ lookupKind, lookupValue }: Props) {
  const [payload, setPayload] = useState<ShareBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setError(null);

    fetchShareBoard({ kind: lookupKind, value: lookupValue })
      .then((nextPayload) => {
        if (!cancelled) setPayload(nextPayload);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "공유 보드를 불러오지 못했어요.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lookupKind, lookupValue]);

  useEffect(() => {
    if (!payload) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createPublicSupabaseClient({
      "x-share-token": payload.shareToken,
    });

    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchShareBoard({ kind: "shareToken", value: payload.shareToken })
          .then((nextPayload) => {
            if (!cancelled) setPayload(nextPayload);
          })
          .catch(() => undefined);
      }, 120);
    };

    const channel = supabase
      .channel(`share-board:${payload.board.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Card",
          filter: `boardId=eq.${payload.board.id}`,
        },
        refetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Section",
          filter: `boardId=eq.${payload.board.id}`,
        },
        refetch,
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [payload?.board.id, payload?.shareToken]);

  if (error) {
    return (
      <main className="board-page" data-board-theme="pastel-sky">
        <div className="share-board-state" role="alert">
          {error}
        </div>
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
