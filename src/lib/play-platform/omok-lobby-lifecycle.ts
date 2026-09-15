import "server-only";
import { db } from "@/lib/db";
import { announceOmokMatchmakingChange } from "@/lib/realtime-broadcast";

/** Retire transient lobby/ticket state, not the match, receipts, or result history.
 * Session identity in every predicate protects a newer rematch from old events. */
export async function retireFinishedOmokSession(sessionId: string): Promise<boolean> {
  const session = await db.playSession.findFirst({
    where: { id: sessionId, gameKind: "omok" },
    select: { state: true, completedAtMs: true },
  });
  if (!session) return false; // Missing is not proof of completion.
  const aggregate = session.state as { state?: { roomStatus?: string }; roomStatus?: string } | null;
  if (session.completedAtMs == null && (aggregate?.state?.roomStatus ?? aggregate?.roomStatus) !== "finished") return false;
  const rooms = await db.omokLobbyRoom.findMany({ where: { sessionId, status: "active" }, select: { lobbyBoardId: true } });
  const tickets = await db.omokMatchTicket.findMany({ where: { sessionId, status: "matched" }, select: { lobbyBoardId: true } });
  if (!rooms.length && !tickets.length) return false;
  await db.$transaction([
    db.omokLobbyRoom.updateMany({ where: { sessionId, status: "active" }, data: { status: "closed" } }),
    db.omokMatchTicket.updateMany({
      where: { sessionId, status: "matched" },
      data: { status: "idle", queueKind: "random", lobbyRoomId: null, matchBoardId: null, sessionId: null, opponentStudentId: null },
    }),
  ]);
  await Promise.all([...new Set([...rooms, ...tickets].map((row) => row.lobbyBoardId))].map((boardId) => announceOmokMatchmakingChange(boardId)));
  return true;
}
