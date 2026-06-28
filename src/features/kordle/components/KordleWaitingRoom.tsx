"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = {
  boardId: string;
};

export function KordleWaitingRoom({ boardId }: Props) {
  const router = useRouter();

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
    </main>
  );
}
