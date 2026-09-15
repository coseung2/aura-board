"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  KORDLE_PUZZLE_CHANGED_EVENT,
  kordleBoardChannelKey,
  type KordlePuzzleChangedEvent,
} from "../realtime";
import {
  GameWaitingRoom,
  type GameWaitingSnapshot,
} from "@/features/games/components/GameWaitingRoom";
import type { GameParticipant } from "@/features/games/components/GameParticipantsList";
import { useKordleLobbyPresence } from "./use-kordle-lobby-presence";

type Props = {
  boardId: string;
  studentId: string;
  studentName: string;
};

export function KordleWaitingRoom({ boardId, studentId, studentName }: Props) {
  const router = useRouter();
  const presence = useKordleLobbyPresence(boardId, { studentId, name: studentName });
  const presenceParticipants = useMemo(() => presence?.map((item) => ({ id: item.studentId, name: item.name, joinedAt: item.joinedAt })) ?? null, [presence]);
  const [realtimeReady, setRealtimeReady] = useState(false);
  // Presence carries only live connection identity. Pets come from the HTTP
  // snapshot, so keep the last known mapping and merge it into presence rows.
  const [petsByStudentId, setPetsByStudentId] = useState<
    Record<string, GameParticipant["representativePet"]>
  >({});

  const pollSnapshot = useCallback(async (): Promise<GameWaitingSnapshot | null> => {
    const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const participants: GameParticipant[] = Array.isArray(data?.puzzle?.participants)
      ? data.puzzle.participants
      : [];
    setPetsByStudentId((current) => {
      let changed = false;
      const next = { ...current };
      for (const participant of participants) {
        if (participant.representativePet === undefined) continue;
        if (next[participant.id] !== participant.representativePet) {
          next[participant.id] = participant.representativePet;
          changed = true;
        }
      }
      return changed ? next : current;
    });
    return {
      status: data?.puzzle?.status ?? null,
      participants,
    };
  }, [boardId]);

  const onReady = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;

    async function subscribe() {
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
        channel = supabase
          .channel(kordleBoardChannelKey(boardId))
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
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              setRealtimeReady(true);
              void pollSnapshot().then((next) => {
                if (cancelled) return;
                if (next?.status === "LIVE") onReady();
                if (!next) setRealtimeReady(false);
              }).catch(() => { if (!cancelled) setRealtimeReady(false); });
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              setRealtimeReady(false);
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
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [boardId, onReady, pollSnapshot]);

  const participantsOverride = useMemo(
    () =>
      presenceParticipants?.map((participant) => ({
        ...participant,
        // `null` keeps the pet slot rendered as the fallback avatar; leaving it
        // undefined would fall back to the legacy name-only chip.
        representativePet: petsByStudentId[participant.id] ?? null,
      })) ?? null,
    [presenceParticipants, petsByStudentId],
  );

  return (
    <GameWaitingRoom
      gameLabel=""
      title="꼬들 입장대기"
      message=""
      pollSnapshot={pollSnapshot}
      onReady={onReady}
      pollDelayMs={1800}
      pollEnabled={!realtimeReady}
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
