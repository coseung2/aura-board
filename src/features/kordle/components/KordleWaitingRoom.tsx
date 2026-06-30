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
      gameLabel="KORDLE ARENA"
      title="꼬들 아레나 입장 대기"
      message="선생님이 라운드를 열면 단어 배틀이 바로 시작됩니다."
      pollSnapshot={pollSnapshot}
      onReady={onReady}
      className="kordle-waiting"
    >
      <div className="kordle-lobby-stage" aria-hidden="true">
        <div className="kordle-lobby-grid">
          {["ㅋ", "ㅗ", "ㄷ", "ㅡ", "ㄹ"].map((cell, index) => (
            <span key={`${cell}-${index}`}>{cell}</span>
          ))}
        </div>
        <div className="kordle-lobby-badges">
          <span>5칸 단어</span>
          <span>동시 참여</span>
          <span>라운드 대기</span>
        </div>
      </div>
      <p className="kordle-lobby-pulse" aria-hidden="true">
        READY<span>.</span><span>.</span><span>.</span>
      </p>
    </GameWaitingRoom>
  );
}
