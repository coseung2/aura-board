export const BOARD_ENGAGEMENT_CONTEXT_EVENT =
  "aura:board-engagement-context-change";

export type BoardEngagementContext = {
  boardId?: string;
  isStudentViewer: boolean;
};

export const EMPTY_BOARD_ENGAGEMENT_CONTEXT: BoardEngagementContext = {
  boardId: undefined,
  isStudentViewer: false,
};

/**
 * Reads the server-rendered board header marker. This is a per-tab signal, so a
 * teacher session and a student-viewer tab can coexist without a shared cookie
 * or localStorage flag deciding engagement authorship for both tabs.
 */
export function readBoardEngagementContext(): BoardEngagementContext {
  if (typeof document === "undefined") {
    return EMPTY_BOARD_ENGAGEMENT_CONTEXT;
  }

  const marker = document.querySelector<HTMLElement>(
    "[data-aura-board-id][data-aura-student-viewer]",
  );
  if (!marker) return EMPTY_BOARD_ENGAGEMENT_CONTEXT;

  return {
    boardId: marker.dataset.auraBoardId || undefined,
    isStudentViewer: marker.dataset.auraStudentViewer === "true",
  };
}
