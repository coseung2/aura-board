/**
 * Realtime channel key helpers.
 *
 * This module only defines channel key strings that the UI and server routes
 * agree on. Keeping channel naming centralized makes future transport swaps
 * local to the transport layer.
 *
 *   board   -> `board:{boardId}`
 *   section -> `board:{boardId}:section:{sectionId}`
 */

export function boardChannelKey(boardId: string): string {
  if (!boardId) throw new Error("boardChannelKey: boardId required");
  return `board:${boardId}`;
}

export function sectionChannelKey(boardId: string, sectionId: string): string {
  if (!boardId) throw new Error("sectionChannelKey: boardId required");
  if (!sectionId) throw new Error("sectionChannelKey: sectionId required");
  return `board:${boardId}:section:${sectionId}`;
}

/** Assignment-board (AB-1) per-board event channel. */
export function assignmentChannelKey(boardId: string): string {
  if (!boardId) throw new Error("assignmentChannelKey: boardId required");
  return `board:${boardId}:assignment`;
}

/** Classroom showcase highlight channel. */
export function classroomShowcaseChannelKey(classroomId: string): string {
  if (!classroomId)
    throw new Error("classroomShowcaseChannelKey: classroomId required");
  return `classroom:${classroomId}:showcase`;
}

/** Classroom morning checks and duty roster channel. */
export function classroomMorningChannelKey(classroomId: string): string {
  if (!classroomId)
    throw new Error("classroomMorningChannelKey: classroomId required");
  return `classroom:${classroomId}:morning`;
}

export const SPEED_GAME_CHANGED_EVENT = "speed_game_changed";
export const PLAY_SESSION_CHANGED_EVENT = "play_session_changed";
export const OMOK_MATCHMAKING_CHANGED_EVENT = "omok_matchmaking_changed";

export type PlaySessionRealtimeEvent = {
  type: typeof PLAY_SESSION_CHANGED_EVENT;
  eventId: string;
  sessionId: string;
  boardId: string;
  version: number;
};

export type OmokMatchmakingRealtimeEvent = {
  type: typeof OMOK_MATCHMAKING_CHANGED_EVENT;
  boardId: string;
  updatedAt: string;
};

export function speedGameChannelKey(gameId: string): string {
  if (!gameId) throw new Error("speedGameChannelKey: gameId required");
  return `speed-game:${gameId}`;
}

export type ClassroomMorningRealtimeEvent = {
  type: "morning_changed";
  classroomId: string;
  changeType:
    | "cleaning_inspection"
    | "shoe_inspection"
    | "yellow_card"
    | "cleaning_duty";
  date: string;
  updatedAt: string;
};

export type ShowcaseRealtimeEvent =
  | {
      type: "showcase_added";
      cardId: string;
      studentId: string;
      classroomId: string;
      createdAt: string;
    }
  | {
      type: "showcase_removed";
      cardId: string;
      studentId: string;
      classroomId: string;
    };

/**
 * Board-level realtime event union. Broadcast event names may be either
 * type-specific (`card_changed`, `queue_changed`, `question_changed`) or the
 * aggregate `board_changed` event for engagement/poll listeners.
 */
export type BoardRealtimeEvent =
  | {
      type: "engagement_changed";
      boardId: string;
      cardId: string;
      likeCount: number;
      commentCount: number;
      changeType?: "like" | "comment";
      changeCount?: number;
      updatedAt: string;
    }
  | {
      type: "engagement_batch_changed";
      boardId: string;
      changes: Array<{
        cardId: string;
        likeCount: number;
        commentCount: number;
        changeType?: "like" | "comment";
        changeCount?: number;
      }>;
      updatedAt: string;
    }
  | {
      type: "card_changed";
      boardId: string;
      cardId: string;
      changeType: "insert" | "update" | "delete";
      updatedAt: string;
    }
  | {
      type: "queue_changed";
      boardId: string;
      changeType: "submit" | "status" | "move" | "delete";
      cardId: string;
      updatedAt: string;
    }
  | {
      type: "poll_changed";
      boardId: string;
      cardId: string;
      updatedAt: string;
    }
  | {
      type: "question_changed";
      boardId: string;
      changeType: "response_insert" | "response_delete" | "config";
      responseId?: string;
      updatedAt: string;
    };

export type AssignmentRealtimeEvent =
  | {
      type: "slot.updated";
      slotId: string;
      submissionStatus: string;
      gradingStatus: string;
      updatedAt: string;
    }
  | {
      type: "slot.returned";
      slotId: string;
      returnReason: string;
      returnedAt: string;
    }
  | {
      type: "reminder.issued";
      boardId: string;
      studentIds: string[];
      issuedAt: string;
    };

export type RealtimeEvent = {
  channel: string;
  type: string;
  payload: unknown;
};
