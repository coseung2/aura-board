"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  KORDLE_PUZZLE_CHANGED_EVENT,
  kordleBoardChannelKey,
  kordleParticipantsFromPresenceState,
  type KordlePresencePayload,
  type KordlePuzzleChangedEvent,
} from "../realtime";
import {
  GameWaitingRoom,
  type GameWaitingSnapshot,
} from "@/features/games/components/GameWaitingRoom";
import type { GameParticipant } from "@/features/games/components/GameParticipantsList";

type Props = {
  boardId: string;
  studentId: string;
  studentName: string;
};

export function KordleWaitingRoom({ boardId, studentId, studentName }: Props) {
  const router = useRouter();
  const [presenceParticipants, setPresenceParticipants] = useState<GameParticipant[] | null>(
    null,
  );
  const [realtimeReady, setRealtimeReady] = useState(false);

  const pollSnapshot = useCallback(async (): Promise<GameWaitingSnapshot | null> => {
    const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    return {
      status: data?.puzzle?.status ?? null,
      participants: Array.isArray(data?.puzzle?.participants) ? data.puzzle.participants : [],
    };
  }, [boardId]);

  const onReady = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    const joinedAt = new Date().toISOString();

    async function subscribe() {
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
        channel = supabase
          .channel(kordleBoardChannelKey(boardId), {
            config: { presence: { key: `${studentId}:${joinedAt}` } },
          })
          .on("presence", { event: "sync" }, () => {
            if (!channel || cancelled) return;
            const state = channel.presenceState() as Record<string, KordlePresencePayload[]>;
            const participants = kordleParticipantsFromPresenceState(state).map((item) => ({
              id: item.studentId,
              name: item.name,
              joinedAt: item.joinedAt,
            }));
            setPresenceParticipants(participants);
          })
          .on(
            "broadcast",
            { event: KORDLE_PUZZLE_CHANGED_EVENT },
            ({ payload }: { payload: KordlePuzzleChangedEvent }) => {
              if (!cancelled && payload?.status === "LIVE") {
                onReady();
              }
            },
          )
          .subscribe((status) => {
            const subscribed = status === "SUBSCRIBED";
            setRealtimeReady(subscribed);
            if (subscribed) {
              void channel?.track({ studentId, name: studentName, joinedAt });
            }
          });
      } catch {
        if (!cancelled) setRealtimeReady(false);
      }
    }

    void subscribe();
    return () => {
      cancelled = true;
      setRealtimeReady(false);
      if (channel) void channel.untrack();
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [boardId, onReady, studentId, studentName]);

  const participantsOverride = useMemo(
    () => presenceParticipants?.map((participant) => ({ ...participant })) ?? null,
    [presenceParticipants],
  );

  return (
    <GameWaitingRoom
      gameLabel=""
      title="꼬들 입장대기"
      message=""
      pollSnapshot={pollSnapshot}
      onReady={onReady}
      pollDelayMs={realtimeReady ? 30000 : 1800}
      participantsOverride={participantsOverride}
      className="kordle-waiting"
    >
      <p className="kordle-lobby-pulse" aria-hidden="true">
        READY<span>.</span>
        <span>.</span>
        <span>.</span>
      </p>
    </GameWaitingRoom>
  );
}
