"use client";

import { useEffect } from "react";

export function useMissionsSSE(boardId: string, onRefresh: () => void) {
  useEffect(() => {
    const es = new EventSource(`/api/boards/${boardId}/stream`);
    es.addEventListener("snapshot", () => {
      onRefresh();
    });
    return () => es.close();
  }, [boardId, onRefresh]);
}
