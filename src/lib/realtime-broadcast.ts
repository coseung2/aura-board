/**
 * Server-side Supabase Realtime broadcast helper.
 *
 * Uses the service-role key to send broadcast events on public channels.
 * Clients subscribe to the same channel and refetch on signal. Broadcast
 * failures are non-fatal because the API mutation already succeeded.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  KORDLE_GUESS_SUBMITTED_EVENT,
  KORDLE_PUZZLE_CHANGED_EVENT,
  kordleBoardChannelKey,
  type KordleLiveEvent,
  type KordlePuzzleChangedEvent,
} from "@/features/kordle/realtime";
import type {
  BoardRealtimeEvent,
  ClassroomMorningRealtimeEvent,
} from "./realtime";
import { boardChannelKey, classroomMorningChannelKey } from "./realtime";

let serverClient: SupabaseClient | null = null;

function getServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (serverClient) return serverClient;
  serverClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serverClient;
}

async function broadcast(
  channelKey: string,
  event: string,
  payload: unknown,
): Promise<void> {
  let client: SupabaseClient | null = null;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;
  try {
    client = getServerClient();
    if (!client) return;
    channel = client.channel(channelKey);
    await channel.httpSend(event, payload, { timeout: 1500 });
  } catch {
    // Realtime is best-effort and must never fail a committed mutation.
  } finally {
    if (client && channel) {
      try {
        void client.removeChannel(channel).catch(() => {});
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

/**
 * Broadcast a card-change event on the board's realtime channel.
 * Clients listening on `board:{boardId}` will refetch a snapshot.
 */
export async function announceCardChange(
  boardId: string,
  changeType: "insert" | "update" | "delete" = "insert",
): Promise<void> {
  if (!boardId) return;
  await broadcast(boardChannelKey(boardId), "card_changed", {
    boardId,
    changeType,
    ts: Date.now(),
  });
}

/**
 * Broadcast a board-level engagement change. Listeners on `board:{boardId}`
 * receive the aggregate `board_changed` event and can patch counts without
 * refetching the whole snapshot.
 */
export async function announceEngagementChange(
  boardId: string,
  cardId: string,
  likeCount: number,
  commentCount: number,
  changeType?: "like" | "comment",
): Promise<void> {
  if (!boardId || !cardId) return;
  const event: BoardRealtimeEvent = {
    type: "engagement_changed",
    boardId,
    cardId,
    likeCount,
    commentCount,
    ...(changeType ? { changeType } : {}),
    updatedAt: new Date().toISOString(),
  };
  await broadcast(boardChannelKey(boardId), "board_changed", event);
}

/** Broadcast a classroom morning-check or duty-roster mutation. */
export async function announceClassroomMorningChange(
  classroomId: string,
  changeType: ClassroomMorningRealtimeEvent["changeType"],
  date: string,
): Promise<void> {
  if (!classroomId || !date) return;
  const event: ClassroomMorningRealtimeEvent = {
    type: "morning_changed",
    classroomId,
    changeType,
    date,
    updatedAt: new Date().toISOString(),
  };
  await broadcast(
    classroomMorningChannelKey(classroomId),
    "morning_changed",
    event,
  );
}

/**
 * Broadcast a DJ queue mutation so listening clients can refetch the queue
 * snapshot without falling back to interval polling.
 */
export async function announceQueueChange(
  boardId: string,
  cardId: string,
  changeType: "submit" | "status" | "move" | "delete",
): Promise<void> {
  if (!boardId || !cardId) return;
  const event: BoardRealtimeEvent = {
    type: "queue_changed",
    boardId,
    cardId,
    changeType,
    updatedAt: new Date().toISOString(),
  };
  await broadcast(boardChannelKey(boardId), "queue_changed", event);
}

/**
 * Broadcast card comment poll changes. Clients refetch /api/cards/:id/poll
 * instead of trusting the event payload for counts.
 */
export async function announcePollChange(
  boardId: string,
  cardId: string,
): Promise<void> {
  if (!boardId || !cardId) return;
  const event: BoardRealtimeEvent = {
    type: "poll_changed",
    boardId,
    cardId,
    updatedAt: new Date().toISOString(),
  };
  await broadcast(boardChannelKey(boardId), "board_changed", event);
}

/**
 * Broadcast question-board response/config changes. Clients listen for the
 * type-specific `question_changed` event and refetch the board snapshot.
 */
export async function announceQuestionChange(
  boardId: string,
  changeType: "response_insert" | "response_delete" | "config",
  responseId?: string,
): Promise<void> {
  if (!boardId) return;
  if (changeType !== "config" && !responseId) return;
  const event: BoardRealtimeEvent = {
    type: "question_changed",
    boardId,
    changeType,
    ...(responseId ? { responseId } : {}),
    updatedAt: new Date().toISOString(),
  };
  await broadcast(boardChannelKey(boardId), "question_changed", event);
}

/**
 * Broadcast a Kordle guess event to the live toast/chat feed.
 * The mutation is already committed, so failures here must not fail gameplay.
 */
export async function announceKordleGuess(
  boardId: string,
  event: KordleLiveEvent,
): Promise<void> {
  if (!boardId || !event.id) return;
  await broadcast(
    kordleBoardChannelKey(boardId),
    KORDLE_GUESS_SUBMITTED_EVENT,
    event,
  );
}

/**
 * Broadcast a Kordle puzzle lifecycle change. Waiting clients can refresh
 * immediately when a teacher starts the puzzle.
 */
export async function announceKordlePuzzleChange(
  boardId: string,
  event: KordlePuzzleChangedEvent,
): Promise<void> {
  if (!boardId || !event.puzzleId) return;
  await broadcast(
    kordleBoardChannelKey(boardId),
    KORDLE_PUZZLE_CHANGED_EVENT,
    event,
  );
}
