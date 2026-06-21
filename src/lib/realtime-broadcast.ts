/**
 * Server-side Supabase Realtime broadcast helper.
 *
 * Uses the service-role key to send broadcast events on public channels.
 * Clients subscribe to the same channel and refetch on signal — no RLS
 * needed because broadcast channels bypass row-level security entirely.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
 *
 * Call this after any mutation that changes the board's card set:
 * POST /api/cards, PATCH /api/cards/:id, DELETE /api/cards/:id.
 */
export async function announceCardChange(
  boardId: string,
  changeType: "insert" | "update" | "delete" = "insert",
): Promise<void> {
  const client = getServerClient();
  if (!client) return; // Supabase not configured — silent no-op.
  try {
    await client.channel(`board:${boardId}`).send({
      type: "broadcast",
      event: "card_changed",
      payload: { boardId, changeType, ts: Date.now() },
    });
  } catch {
    // Broadcast failures are non-fatal — clients fall back to no realtime.
  }
}

/**
 * Broadcast a board-level engagement change (like/comment counts) on the
 * board's realtime channel. Listeners on `board:{boardId}` receive the
 * `board_changed` broadcast event and can patch counts without refetching
 * the whole snapshot.
 *
 * Failures are non-fatal — clients will simply re-sync on their next
 * polling/snapshot fetch.
 */
export async function announceEngagementChange(
  boardId: string,
  cardId: string,
  likeCount: number,
  commentCount: number,
): Promise<void> {
  if (!boardId || !cardId) return;
  const client = getServerClient();
  if (!client) return; // Supabase not configured — silent no-op.
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
    // Broadcast failures are non-fatal — clients fall back to no realtime.
  }
}
