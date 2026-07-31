/**
 * Server-side Supabase Realtime broadcast helper.
 *
 * Uses the service-role key to send broadcast events on public channels.
 * Clients subscribe to the same channel and refetch on signal. The core send
 * is strict; committed mutation routes explicitly opt into best-effort use.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
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
import type {
  BoardRealtimeEvent,
  ClassroomMorningRealtimeEvent,
} from "./realtime";
import {
  boardChannelKey,
  classroomMorningChannelKey,
  SPEED_GAME_CHANGED_EVENT,
  speedGameChannelKey,
} from "./realtime";

let serverClient: SupabaseClient | null = null;

export class RealtimeConfigurationError extends Error {
  constructor() {
    super(
      "Supabase Realtime is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    this.name = "RealtimeConfigurationError";
  }
}

function getServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RealtimeConfigurationError();
  if (serverClient) return serverClient;
  serverClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return serverClient;
}

export async function sendRealtimeBroadcast(
  channelKey: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const client = getServerClient();
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;
  try {
    channel = client.channel(channelKey);
    const result = await channel.httpSend(event, payload, { timeout: 1500 });
    if (!result.success) {
      throw new Error(
        `Supabase Realtime broadcast failed (${result.status}): ${result.error}`,
      );
    }
  } finally {
    if (channel) {
      try {
        await client.removeChannel(channel);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

async function broadcastBestEffort(
  channelKey: string,
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    await sendRealtimeBroadcast(channelKey, event, payload);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("[realtime broadcast] delivery failed", error);
    }
  }
}

const channelSchema = z.string().trim().min(1).max(255);
const idSchema = z.string().trim().min(1);
const timestampSchema = z.string().datetime({ offset: true });

function legacyEventSchema<T extends string, S extends z.ZodRawShape>(
  type: T,
  payload: S,
) {
  return z.object({
    channel: channelSchema,
    type: z.literal(type),
    payload: z.object({ type: z.literal(type).optional(), ...payload }),
  });
}

const legacyPublishSchema = z
  .discriminatedUnion("type", [
    legacyEventSchema("slot.updated", {
      slotId: idSchema,
      submissionStatus: z.string().min(1),
      gradingStatus: z.string().min(1),
      updatedAt: timestampSchema,
    }),
    legacyEventSchema("slot.returned", {
      slotId: idSchema,
      returnReason: z.string(),
      returnedAt: timestampSchema,
    }),
    legacyEventSchema("reminder.issued", {
      boardId: idSchema,
      studentIds: z.array(idSchema),
      issuedAt: timestampSchema,
    }),
    legacyEventSchema("showcase_added", {
      cardId: idSchema,
      studentId: idSchema,
      classroomId: idSchema,
      createdAt: timestampSchema,
    }),
    legacyEventSchema("showcase_removed", {
      cardId: idSchema,
      studentId: idSchema,
      classroomId: idSchema,
    }),
    legacyEventSchema("project.created", {
      projectId: idSchema,
      boardId: idSchema,
    }),
    legacyEventSchema("review.created", {
      projectId: idSchema,
      ratingAvg: z.number().nullable(),
      reviewCount: z.number().int().nonnegative(),
    }),
    legacyEventSchema("project.approved", {
      projectId: idSchema,
      boardId: idSchema,
    }),
    legacyEventSchema("project.rejected", {
      projectId: idSchema,
      boardId: idSchema,
      note: z.string().nullable().optional(),
    }),
  ])
  .superRefine((event, ctx) => {
    const expectedChannel =
      event.type === "slot.updated" ||
      event.type === "slot.returned" ||
      event.type === "reminder.issued"
        ? /^board:[^:]+:assignment$/
        : event.type === "showcase_added" || event.type === "showcase_removed"
          ? /^classroom:[^:]+:showcase$/
          : /^board:[^:]+:vibe-arcade$/;
    if (!expectedChannel.test(event.channel)) {
      ctx.addIssue({
        code: "custom",
        path: ["channel"],
        message: `Channel does not match ${event.type}`,
      });
    }
  });

/** Validate a legacy publish contract and emit only a public invalidation. */
export async function publishValidatedRealtimeEvent(event: unknown): Promise<void> {
  const parsed = legacyPublishSchema.parse(event);
  await sendRealtimeBroadcast(parsed.channel, parsed.type, { type: parsed.type });
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
  await broadcastBestEffort(boardChannelKey(boardId), "card_changed", {
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
  await broadcastBestEffort(boardChannelKey(boardId), "board_changed", event);
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
  await broadcastBestEffort(
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
  await broadcastBestEffort(boardChannelKey(boardId), "queue_changed", event);
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
  await broadcastBestEffort(boardChannelKey(boardId), "board_changed", event);
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
  await broadcastBestEffort(boardChannelKey(boardId), "question_changed", event);
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
  await broadcastBestEffort(quizChannelKey(snapshot.quizId), QUIZ_SNAPSHOT_EVENT, snapshot);
}

/** Broadcast a speed-game mutation; clients reconcile through the GET API. */
export async function announceSpeedGameChange(
  gameId: string,
  changeType: "start" | "next" | "finish" | "answer",
): Promise<void> {
  if (!gameId) return;
  void changeType;
  await broadcastBestEffort(speedGameChannelKey(gameId), SPEED_GAME_CHANGED_EVENT, {
    type: SPEED_GAME_CHANGED_EVENT,
  });
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
  await broadcastBestEffort(
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
  await broadcastBestEffort(
    kordleBoardChannelKey(boardId),
    KORDLE_PUZZLE_CHANGED_EVENT,
    event,
  );
}
