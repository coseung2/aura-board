"use client";

import { useEffect } from "react";
import {
  BOARD_ANONYMITY_EVENT,
  type BoardAnonymityChangeDetail,
} from "@/lib/card-anonymity";

export function useBoardAnonymityChange(
  boardId: string,
  onChange: (anonymousAuthor: boolean) => void,
) {
  useEffect(() => {
    function handleBoardAnonymityChange(event: Event) {
      const detail = (event as CustomEvent<BoardAnonymityChangeDetail>).detail;
      if (!detail || detail.boardId !== boardId) return;
      onChange(detail.anonymousAuthor);
    }

    window.addEventListener(BOARD_ANONYMITY_EVENT, handleBoardAnonymityChange);
    return () =>
      window.removeEventListener(
        BOARD_ANONYMITY_EVENT,
        handleBoardAnonymityChange,
      );
  }, [boardId, onChange]);
}
