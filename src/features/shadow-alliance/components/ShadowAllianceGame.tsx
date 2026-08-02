"use client";

import { ShadowAllianceBoard } from "@/components/ShadowAllianceBoard";

type Props = {
  boardId: string;
  viewer: "teacher" | "student";
};

/**
 * Compatibility entry point for callers that still import the feature-local
 * component. Authority and mutations live in the shared server-backed board.
 */
export function ShadowAllianceGame({ boardId, viewer }: Props) {
  return (
    <ShadowAllianceBoard
      boardId={boardId}
      boardTitle="그림자연합"
      viewer={viewer}
    />
  );
}
