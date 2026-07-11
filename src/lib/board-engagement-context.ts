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

export function shouldUseStudentBoardViewer({
  boardClassroomId,
  studentClassroomId,
  hasTeacherSession,
  studentViewRequested,
}: {
  boardClassroomId: string | null | undefined;
  studentClassroomId: string | null | undefined;
  hasTeacherSession: boolean;
  studentViewRequested: boolean;
}): boolean {
  return Boolean(
    boardClassroomId &&
      studentClassroomId === boardClassroomId &&
      (!hasTeacherSession || studentViewRequested),
  );
}

/** Reads the current tab's server-rendered board viewer marker. */
export function readBoardEngagementContext(): BoardEngagementContext {
  if (typeof document === "undefined") return EMPTY_BOARD_ENGAGEMENT_CONTEXT;
  const marker = document.querySelector<HTMLElement>(
    "[data-aura-board-id][data-aura-student-viewer]",
  );
  if (!marker) return EMPTY_BOARD_ENGAGEMENT_CONTEXT;
  return {
    boardId: marker.dataset.auraBoardId || undefined,
    isStudentViewer: marker.dataset.auraStudentViewer === "true",
  };
}
