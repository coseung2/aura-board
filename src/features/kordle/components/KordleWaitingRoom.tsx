"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { GameWaitingRoom } from "@/features/games/components/GameWaitingRoom";

type Props = {
  boardId: string;
};

export function KordleWaitingRoom({ boardId }: Props) {
  const router = useRouter();
  const pollSnapshot = useCallback(async () => {
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

  return (
    <GameWaitingRoom
      gameLabel=""
      title="꼬들 입장대기"
      message=""
      pollSnapshot={pollSnapshot}
      onReady={onReady}
      className="kordle-waiting"
    >
      <p className="kordle-lobby-pulse" aria-hidden="true">
        READY<span>.</span><span>.</span><span>.</span>
      </p>
    </GameWaitingRoom>
  );
}
