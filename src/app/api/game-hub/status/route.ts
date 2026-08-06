import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OFFICIAL_GAME_KINDS, type OfficialGameKind } from "@/lib/game-platform/contracts";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HubPhase = "open" | "waiting" | "active" | "paused" | "finished";

type HubStatus = {
  phase: HubPhase;
  label: string;
  playerCount: number;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function playState(value: unknown): JsonRecord {
  const aggregate = record(value);
  return record(aggregate.state);
}

function joinedPlayerCount(value: unknown, fallback: number): number {
  const aggregate = record(value);
  const identities = Object.values(record(aggregate.participants));
  if (identities.length === 0) return fallback;
  return identities.filter((identity) => {
    const joinedAt = record(identity).joinedAtMs;
    return typeof joinedAt === "number" || typeof joinedAt === "string";
  }).length;
}

function playStatus(kind: OfficialGameKind, session: { state: unknown; completedAtMs: bigint | null; participants: unknown[] }): HubStatus {
  const state = playState(session.state);
  const phase = String(state.phase ?? state.roomStatus ?? "");
  const playerCount = kind === "omok"
    ? session.participants.length
    : joinedPlayerCount(session.state, session.participants.length);
  if (session.completedAtMs != null || ["finished", "host-ended"].includes(phase)) {
    return { phase: "finished", label: "종료됨", playerCount };
  }
  if (kind === "shadow-alliance" && state.pausedRemainingMs != null) {
    return { phase: "paused", label: "이어하기", playerCount };
  }
  if (["active", "playing", "guessing", "revealing", "postround", "ready"].includes(phase)) {
    return { phase: "active", label: "진행 중", playerCount };
  }
  return { phase: "waiting", label: "대기 중", playerCount };
}

function chooseStatus(current: HubStatus, candidate: HubStatus): HubStatus {
  const priority: Record<HubPhase, number> = { active: 5, paused: 4, waiting: 3, finished: 2, open: 1 };
  if (priority[candidate.phase] > priority[current.phase]) return candidate;
  if (candidate.phase === current.phase) {
    return { ...current, playerCount: current.playerCount + candidate.playerCount };
  }
  return current;
}

export async function GET() {
  const student = await getCurrentStudent();
  let classroomIds: string[];
  if (student) {
    classroomIds = [student.classroomId];
  } else {
    const user = await getCurrentUser().catch(() => null);
    if (!user) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    const classrooms = await db.classroom.findMany({
      where: { teacherId: user.id },
      select: { id: true },
    });
    classroomIds = classrooms.map((classroom) => classroom.id);
  }

  const statuses = Object.fromEntries(
    OFFICIAL_GAME_KINDS.map((kind) => [
      kind,
      { phase: "open", label: "입장 가능", playerCount: 0 } satisfies HubStatus,
    ]),
  ) as Record<OfficialGameKind, HubStatus>;
  if (classroomIds.length === 0) return jsonPrivateNoStore({ statuses });

  const boards = await db.board.findMany({
    where: {
      classroomId: { in: classroomIds },
      systemGameKind: { in: [...OFFICIAL_GAME_KINDS] },
    },
    select: {
      systemGameKind: true,
      playSessions: {
        where: { current: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          state: true,
          completedAtMs: true,
          participants: { select: { id: true } },
        },
      },
      speedGameRuns: {
        where: { current: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          completedAt: true,
          participants: { select: { joinedAt: true } },
        },
      },
      kordleGame: {
        select: {
          puzzles: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { status: true, attempts: { select: { id: true } } },
          },
        },
      },
    },
  });

  for (const board of boards) {
    const kind = board.systemGameKind as OfficialGameKind | null;
    if (!kind || !OFFICIAL_GAME_KINDS.includes(kind)) continue;
    let next: HubStatus | null = null;
    const session = board.playSessions[0];
    if (session) next = playStatus(kind, session);
    if (kind === "speed-game" && board.speedGameRuns[0]) {
      const run = board.speedGameRuns[0];
      const playerCount = run.participants.filter((participant) => participant.joinedAt != null).length;
      next = run.completedAt || run.status === "finished"
        ? { phase: "finished", label: "종료됨", playerCount }
        : run.status === "running"
          ? { phase: "active", label: "진행 중", playerCount }
          : { phase: "waiting", label: "대기 중", playerCount };
    }
    if (kind === "kordle" && board.kordleGame?.puzzles[0]) {
      const puzzle = board.kordleGame.puzzles[0];
      next = puzzle.status === "LIVE"
        ? { phase: "active", label: "진행 중", playerCount: puzzle.attempts.length }
        : puzzle.status === "CLOSED" || puzzle.status === "ARCHIVED"
          ? { phase: "finished", label: "종료됨", playerCount: puzzle.attempts.length }
          : { phase: "waiting", label: "대기 중", playerCount: puzzle.attempts.length };
    }
    if (next) statuses[kind] = chooseStatus(statuses[kind], next);
  }

  const omokTickets = await db.omokMatchTicket.findMany({
    where: {
      classroomId: { in: classroomIds },
      OR: [
        { status: "waiting", requestedAt: { gte: new Date(Date.now() - 30_000) } },
        { status: "matched" },
      ],
    },
    select: { status: true, matchBoardId: true },
  });
  const matchedBoardIds = omokTickets.flatMap((ticket) =>
    ticket.status === "matched" && ticket.matchBoardId ? [ticket.matchBoardId] : [],
  );
  const liveMatches = matchedBoardIds.length > 0
    ? await db.playSession.findMany({
        where: { boardId: { in: matchedBoardIds }, current: true, completedAtMs: null },
        select: { boardId: true },
      })
    : [];
  const liveBoardIds = new Set(liveMatches.map((session) => session.boardId));
  const waitingCount = omokTickets.filter((ticket) => ticket.status === "waiting").length;
  const playingCount = omokTickets.filter(
    (ticket) => ticket.status === "matched" && ticket.matchBoardId && liveBoardIds.has(ticket.matchBoardId),
  ).length;
  statuses.omok = playingCount > 0
    ? { phase: "active", label: "대국 중", playerCount: playingCount + waitingCount }
    : waitingCount > 0
      ? { phase: "waiting", label: "매칭 중", playerCount: waitingCount }
      : { phase: "open", label: "입장 가능", playerCount: 0 };

  return jsonPrivateNoStore({ statuses });
}
