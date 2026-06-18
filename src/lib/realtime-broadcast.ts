/**
 * Server-side Supabase Realtime broadcast helper.
 *
 * Uses the service-role key to send broadcast events on public channels.
 * Clients subscribe to the same channel and refetch on signal — no RLS
 * needed because broadcast channels bypass row-level security entirely.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
