"use client";

import { useEffect } from "react";

const MISSIONS_POLL_MS = 30_000;

export function useMissionsSSE(boardId: string, onRefresh: () => void) {
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function schedulePoll() {
      if (stopped || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        poll();
      }, MISSIONS_POLL_MS);
    }

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/boards/${boardId}/snapshot`, {
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403) {
          stopped = true;
          return;
        }
        if (res.ok) onRefresh();
      } catch {}
      schedulePoll();
    }

    poll();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [boardId, onRefresh]);
}
