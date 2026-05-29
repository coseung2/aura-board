/**
 * share-auth — validate share token and check permission level for a board.
 *
 * Used by share card/comment endpoints to authorize anonymous share users.
 */
import { db } from "@/lib/db";
import { tokensEqual } from "./tokens";
import type { SharePermission } from "@/lib/card-permissions";

export type ShareAuth = {
  ok: true;
  boardId: string;
  boardTitle: string;
  permission: SharePermission;
} | {
  ok: false;
  reason: "not_found" | "token_invalid" | "insufficient_permission";
};

const PERMISSION_RANK: Record<SharePermission, number> = {
  view: 0,
  comment: 1,
  edit: 2,
};

/**
 * Validate shareToken + check that the board's shareMode grants at least
 * the `required` permission level.
 */
export async function authorizeShareAccess(
  shareToken: string,
  required: SharePermission
): Promise<ShareAuth> {
  const board = await db.board.findUnique({
    where: { shareToken },
    select: {
      id: true,
      title: true,
      shareMode: true,
      shareToken: true,
    },
  });
  if (!board) return { ok: false, reason: "not_found" };
  if (!board.shareToken || !tokensEqual(shareToken, board.shareToken)) {
    return { ok: false, reason: "token_invalid" };
  }
  const mode = board.shareMode as SharePermission;
  if (!(mode in PERMISSION_RANK)) {
    return { ok: false, reason: "insufficient_permission" };
  }
  if (PERMISSION_RANK[mode] < PERMISSION_RANK[required]) {
    return { ok: false, reason: "insufficient_permission" };
  }
  return {
    ok: true,
    boardId: board.id,
    boardTitle: board.title,
    permission: mode,
  };
}
