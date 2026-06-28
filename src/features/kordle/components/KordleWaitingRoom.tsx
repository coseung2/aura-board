"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  boardId: string;
};

type Participant = {
  id: string;
  name: string;
  joinedAt: string;
};

export function KordleWaitingRoom({ boardId }: Props) {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/kordle/boards/${boardId}/puzzle`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (!cancelled && Array.isArray(data?.puzzle?.participants)) {
            setParticipants(data.puzzle.participants);
          }
          if (!cancelled && data?.puzzle?.status === "LIVE") {
            router.refresh();
            return;
          }
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, 1800);
        }
      }
    }

    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [boardId, router]);

  return (
    <main className="kordle-waiting">
      <p className="kordle-kicker">꼬들</p>
      <h1>선생님이 시작하면 바로 열립니다</h1>
      <p>잠시만 기다려 주세요.</p>
      <div className="kordle-waiting-participants" aria-label="입장한 학생">
        <span>입장 {participants.length}명</span>
        {participants.length > 0 && (
          <div>
            {participants.map((participant) => (
              <strong key={participant.id}>{participant.name}</strong>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
