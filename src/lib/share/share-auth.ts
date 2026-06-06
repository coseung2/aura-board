/**
 * share-auth — validate share token for a board.
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
  reason: "not_found" | "token_invalid" | "sharing_disabled";
};

/** Validate shareToken for the unified student-permission share mode. */
export async function authorizeShareAccess(
  shareToken: string,
  _required: SharePermission
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
  if (board.shareMode !== "student") {
    return { ok: false, reason: "sharing_disabled" };
  }
  return {
    ok: true,
    boardId: board.id,
    boardTitle: board.title,
    permission: "student",
  };
}
