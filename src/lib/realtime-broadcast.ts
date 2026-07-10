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
import {
  QUIZ_SNAPSHOT_EVENT,
  quizChannelKey,
  type QuizRealtimeSnapshot,
} from "@/features/quiz/realtime";
import type { BoardRealtimeEvent } from "./realtime";
import { boardChannelKey } from "./realtime";

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

/**
 * Broadcast a card-change event on the board's realtime channel.
 * Clients listening on `board:{boardId}` will refetch a snapshot.
 */
export async function announceCardChange(
  boardId: string,
  changeType: "insert" | "update" | "delete" = "insert",
): Promise<void> {
  const client = getServerClient();
  if (!client) return;
  try {
    await client.channel(boardChannelKey(boardId)).send({
      type: "broadcast",
      event: "card_changed",
      payload: { boardId, changeType, ts: Date.now() },
    });
  } catch {
    // ignore
  }
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
): Promise<void> {
  if (!boardId || !cardId) return;
  const client = getServerClient();
  if (!client) return;
  const event: BoardRealtimeEvent = {
    type: "engagement_changed",
    boardId,
    cardId,
    likeCount,
    commentCount,
    updatedAt: new Date().toISOString(),
  };
  try {
    await client.channel(boardChannelKey(boardId)).send({
      type: "broadcast",
      event: "board_changed",
      payload: event,
    });
  } catch {
    // ignore
  }
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
  const client = getServerClient();
  if (!client) return;
  const event: BoardRealtimeEvent = {
    type: "queue_changed",
    boardId,
    cardId,
    changeType,
    updatedAt: new Date().toISOString(),
  };
  try {
    await client.channel(boardChannelKey(boardId)).send({
      type: "broadcast",
      event: "queue_changed",
      payload: event,
    });
  } catch {
    // ignore
  }
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
  const client = getServerClient();
  if (!client) return;
  const event: BoardRealtimeEvent = {
    type: "poll_changed",
    boardId,
    cardId,
    updatedAt: new Date().toISOString(),
  };
  try {
    await client.channel(boardChannelKey(boardId)).send({
      type: "broadcast",
      event: "board_changed",
      payload: event,
    });
  } catch {
    // ignore
  }
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
  const client = getServerClient();
  if (!client) return;
  const event: BoardRealtimeEvent = {
    type: "question_changed",
    boardId,
    changeType,
    ...(responseId ? { responseId } : {}),
    updatedAt: new Date().toISOString(),
  };
  try {
    await client.channel(boardChannelKey(boardId)).send({
      type: "broadcast",
      event: "question_changed",
      payload: event,
    });
  } catch {
    // ignore
  }
}

/**
 * Broadcast a safe, committed quiz snapshot. Unlike content boards, game
 * clients can apply this compact payload directly; focus/reconnect polling
 * still reads the same snapshot endpoint as the recovery source of truth.
 */
export async function announceQuizSnapshot(
  snapshot: QuizRealtimeSnapshot,
): Promise<void> {
  if (!snapshot.quizId) return;
  const client = getServerClient();
  if (!client) return;
  try {
    await client.channel(quizChannelKey(snapshot.quizId)).send({
      type: "broadcast",
      event: QUIZ_SNAPSHOT_EVENT,
      payload: snapshot,
    });
  } catch {
    // Mutation already committed; recovery polling will reconcile clients.
  }
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
  const client = getServerClient();
  if (!client) return;
  try {
    await client.channel(kordleBoardChannelKey(boardId)).send({
      type: "broadcast",
      event: KORDLE_GUESS_SUBMITTED_EVENT,
      payload: event,
    });
  } catch {
    // ignore
  }
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
  const client = getServerClient();
  if (!client) return;
  try {
    await client.channel(kordleBoardChannelKey(boardId)).send({
      type: "broadcast",
      event: KORDLE_PUZZLE_CHANGED_EVENT,
      payload: event,
    });
  } catch {
    // ignore
  }
}
