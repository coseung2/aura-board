import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OFFICIAL_GAME_KINDS, type OfficialGameKind } from "@/lib/game-platform/contracts";
import { asRecord, combineHubStatus, OPEN_HUB_STATUS, playHubStatus, type HubStatus } from "@/lib/game-platform/hub-status";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";
import { gameHubChannelKey } from "@/lib/realtime";
import { withProductFeature } from "@/lib/product-release-server";
import { resolveSongGuessActorForBoard } from "@/lib/play-platform/actor";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Student-created rooms are intentionally non-current. The canonical teacher
// session and student rooms must both be considered, but terminal history must not.
const activeSessionWhere: Prisma.PlaySessionWhereInput = {
  completedAtMs: null,
  OR: [
    { current: true },
    { gameKind: "song-guess", state: { path: ["roomMode"], equals: "student-free" } },
  ],
  NOT: { state: { path: ["state", "phase"], equals: "finished" } },
};
const sessionSelect = { state: true, completedAtMs: true } as const;

export const GET = withProductFeature("play", GETHandler);
async function GETHandler() {
  const student = await getCurrentStudent();
  let classroomIds: string[];
  if (student) {
    classroomIds = [student.classroomId];
  } else {
    const user = await getCurrentUser().catch(() => null);
    if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    classroomIds = (await db.classroom.findMany({ where: { teacherId: user.id }, select: { id: true } })).map((c) => c.id);
  }
  const statuses = Object.fromEntries(OFFICIAL_GAME_KINDS.map((kind) => [kind, { ...OPEN_HUB_STATUS }])) as Record<OfficialGameKind, HubStatus>;
  const channels = classroomIds.map(gameHubChannelKey);
  const presenceScopeIds = [...classroomIds];
  if (classroomIds.length === 0) return jsonPrivateNoStore({ statuses, channels, presenceScopeIds });
  const now = Date.now();
  let nextRefreshAtMs: number | null = null;
  const boards = await db.board.findMany({
    where: { classroomId: { in: classroomIds }, systemGameKind: { in: [...OFFICIAL_GAME_KINDS] } },
    select: {
      id: true,
      systemGameKind: true,
      playSessions: { where: activeSessionWhere, select: sessionSelect },
      speedGameRuns: {
        where: { current: true, completedAt: null },
        orderBy: { createdAt: "desc" }, take: 1,
        select: { status: true, participants: { where: { joinedAt: { not: null }, forfeitedAt: null }, select: { studentId: true } } },
      },
      kordleGame: {
        select: { puzzles: { orderBy: { updatedAt: "desc" }, take: 1, select: { status: true, attempts: { where: { studentId: { not: null } }, select: { studentId: true } } } } },
      },
    },
  });
  for (const board of boards) {
    const kind = board.systemGameKind as OfficialGameKind;
    if (!OFFICIAL_GAME_KINDS.includes(kind)) continue;
    let sessions = board.playSessions;
    // Automatic rooms must finish even when every gameplay screen has closed.
    // Ask the existing authority to catch up; never infer a terminal result locally.
    if (kind === "song-guess" && sessions.some((s) => {
      const due = asRecord(s.state).nextTransitionAtMs;
      return typeof due === "number" && due <= now;
    })) {
      try {
        const { actor } = await resolveSongGuessActorForBoard(board.id);
        const response = await playEngineFetch(`/v1/boards/${encodeURIComponent(board.id)}/song-guess/sessions`, { actor });
        if (!response.ok) throw new Error("song_rooms_unavailable");
        await response.arrayBuffer();
        sessions = await db.playSession.findMany({ where: { boardId: board.id, ...activeSessionWhere }, select: sessionSelect });
      } catch {
        statuses[kind] = { phase: "open", label: "상태 확인 필요", playerCount: 0, countKind: "participants" };
        continue;
      }
    }
    for (const session of sessions) {
      statuses[kind] = combineHubStatus(statuses[kind], playHubStatus(kind, session.state, session.completedAtMs));
      const due = asRecord(session.state).nextTransitionAtMs;
      if (typeof due === "number" && due > now) nextRefreshAtMs = Math.min(nextRefreshAtMs ?? due, due);
    }
    if (kind === "speed-game" && board.speedGameRuns[0]) {
      const run = board.speedGameRuns[0];
      if (run.status !== "finished") statuses[kind] = combineHubStatus(statuses[kind], {
        phase: run.status === "running" ? "active" : "waiting",
        label: run.status === "running" ? "진행 중" : "대기 중",
        playerCount: new Set(run.participants.map((p) => p.studentId)).size,
        countKind: "participants",
      });
    }
    if (kind === "kordle" && board.kordleGame?.puzzles[0]) {
      const puzzle = board.kordleGame.puzzles[0];
      if (!["CLOSED", "ARCHIVED"].includes(puzzle.status)) statuses[kind] = combineHubStatus(statuses[kind], {
        phase: puzzle.status === "LIVE" ? "active" : "waiting",
        label: puzzle.status === "LIVE" ? "진행 중" : "시작 대기",
        playerCount: new Set(puzzle.attempts.map((p) => p.studentId)).size,
        countKind: "participants",
      });
    }
  }
  const tickets = await db.omokMatchTicket.findMany({
    where: { classroomId: { in: classroomIds }, OR: [
      { status: "waiting", requestedAt: { gte: new Date(now - 30_000) } },
      { status: "matched" },
    ] },
    select: { status: true, matchBoardId: true, studentId: true },
  });
  const matchedIds = [...new Set(tickets.flatMap((t) => t.status === "matched" && t.matchBoardId ? [t.matchBoardId] : []))];
  const matches = matchedIds.length ? await db.playSession.findMany({
    where: { boardId: { in: matchedIds }, current: true, completedAtMs: null },
    select: { boardId: true, state: true },
  }) : [];
  const liveIds = new Set(matches.filter((s) => {
    const state = asRecord(asRecord(s.state).state);
    return state.roomStatus !== "finished";
  }).map((s) => s.boardId));
  const waiting = tickets.filter((t) => t.status === "waiting");
  const playing = tickets.filter((t) => t.status === "matched" && t.matchBoardId && liveIds.has(t.matchBoardId));
  statuses.omok = playing.length ? { phase: "active", label: "대국 중", playerCount: new Set([...playing, ...waiting].map((t) => t.studentId)).size, countKind: "participants" }
    : waiting.length ? { phase: "waiting", label: "매칭 중", playerCount: new Set(waiting.map((t) => t.studentId)).size, countKind: "queue" }
      : { ...OPEN_HUB_STATUS };
  return jsonPrivateNoStore({ statuses, channels, presenceScopeIds, serverTimeMs: Date.now(), nextRefreshAtMs });
}
