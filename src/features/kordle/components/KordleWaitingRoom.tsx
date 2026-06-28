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
      gameLabel="꼬들"
      title="선생님이 시작하면 바로 열립니다"
      message="잠시만 기다려 주세요."
      pollSnapshot={pollSnapshot}
      onReady={onReady}
      className="kordle-waiting"
    />
  );
}
