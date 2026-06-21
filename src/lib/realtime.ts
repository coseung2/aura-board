/**
 * Realtime channel key helpers.
 *
 * NOTE (Breakout T0-①): This module only defines *channel key strings* that
 * the UI and server routes can agree on. The actual pub/sub engine (Supabase
 * Realtime, PartyKit, Pusher, …) has not been chosen yet — that decision is
 * deferred to a separate research task (`research/realtime-engine`).
 *
 * By keeping the channel naming convention here, any future engine swap only
 * needs to rewire the transport layer; call sites that use these helpers
 * remain stable.
 *
 *   board  → `board:{boardId}`                (all events for the whole board)
 *   section→ `board:{boardId}:section:{sectionId}`  (breakout-scoped events)
 *
 * Consumers MUST NOT construct channel names by hand. Use these helpers so
 * the format stays canonical and greppable.
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

/** Classroom 자랑해요 highlight 영역 (student-portfolio 2026-04-26).
 *  학급 dashboard 가 구독해 자랑해요 추가/제거 시 즉시 반영. */
export function classroomShowcaseChannelKey(classroomId: string): string {
  if (!classroomId)
    throw new Error("classroomShowcaseChannelKey: classroomId required");
  return `classroom:${classroomId}:showcase`;
}

export type ShowcaseRealtimeEvent =
  | { type: "showcase_added"; cardId: string; studentId: string; classroomId: string; createdAt: string }
  | { type: "showcase_removed"; cardId: string; studentId: string; classroomId: string };

/**
 * Board-level realtime event union.
 *
 * Broadcast on the `board:{boardId}` channel under the event name
 * `board_changed` (see `realtime-broadcast.ts`).
 */
export type BoardRealtimeEvent =
  | {
      type: "engagement_changed";
      boardId: string;
      cardId: string;
      likeCount: number;
      commentCount: number;
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

/**
 * Placeholder publish/subscribe. Intentionally a no-op.
 * When the realtime engine is chosen, replace the body of this module while
 * keeping the signatures so callers (if added) won't need updates.
 */
export type RealtimeEvent = {
  channel: string;
  type: string;
  payload: unknown;
};

export async function publish(_event: RealtimeEvent): Promise<void> {
  // no-op until a realtime engine is adopted
}
