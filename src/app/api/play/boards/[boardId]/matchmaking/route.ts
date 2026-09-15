import { randomUUID } from "node:crypto";
import { BoardCategory } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import type { PlayActor } from "@/lib/play-platform/actor";
import {
  OMOK_BOT_ACTOR_SUBJECT,
  OMOK_BOT_DISPLAY_NAME,
} from "@/lib/play-platform/omok-bot";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import { announceOmokMatchmakingChange } from "@/lib/realtime-broadcast";
import { getCurrentStudentIdentity } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };
const WAITING_HEARTBEAT_MS = 30_000;
const WAITING_HEARTBEAT_REFRESH_MS = 10_000;
const MatchmakingRequestSchema = z
  .object({
    action: z.enum(["random", "computer", "create_room", "join_room"]).optional(),
    roomId: z.string().trim().min(1).max(64).optional(),
    roomName: z.string().trim().min(1).max(24).optional(),
    joinMode: z.enum(["player", "spectator"]).optional(),
    opponent: z.enum(["human", "computer"]).optional(),
  })
  .strict();

type ParticipantSeed = { actorSubject: string; displayName: string };
type MatchReservation =
  | {
      kind: "human";
      matchBoardId: string;
      classroomId: string;
      teacherId: string;
      studentIds: [string, string];
    }
  | {
      kind: "computer";
      matchBoardId: string;
      classroomId: string;
      teacherId: string;
      participants: [ParticipantSeed, ParticipantSeed];
    };

async function resolveLobby(boardId: string, classroomId: string) {
  const board = await db.board.findFirst({
    where: {
      id: boardId,
      classroomId,
      layout: "omok",
      systemGameKind: "omok",
    },
    select: {
      id: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board?.classroom) return null;
  return {
    id: board.id,
    classroomId: board.classroomId,
    teacherId: board.classroom.teacherId,
  };
}

async function engineJson(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

async function createStartedMatch(input: {
  matchBoardId: string;
  participants: [ParticipantSeed, ParticipantSeed];
  teacherId: string;
}) {
  const host: PlayActor = {
    subject: `teacher:${input.teacherId}`,
    role: "host",
    userId: input.teacherId,
    studentId: null,
  };
  const created = await playEngineFetch(
    `/v1/boards/${encodeURIComponent(input.matchBoardId)}/sessions`,
    {
      actor: host,
      method: "POST",
      body: {
        requestId: `omok-match-${input.matchBoardId}`,
        participants: input.participants,
        autoStart: true,
      },
    },
  );
  if (!created.ok) throw new Error(`omok_match_create_${created.status}`);
  const createdBody = await engineJson(created);
  const snapshot = createdBody?.snapshot as
    | { sessionId?: string; version?: number; roomStatus?: string }
    | undefined;
  if (
    !snapshot?.sessionId ||
    !Number.isSafeInteger(snapshot.version) ||
    snapshot.roomStatus !== "active"
  ) {
    throw new Error("omok_match_invalid_create");
  }
  return snapshot.sessionId;
}

function isFinishedSession(session: { completedAtMs: bigint | null; state: unknown } | null): boolean {
  if (!session || session.completedAtMs != null) return true;
  if (!session.state || typeof session.state !== "object" || Array.isArray(session.state)) {
    return false;
  }
  const record = session.state as Record<string, unknown>;
  const state =
    record.state && typeof record.state === "object" && !Array.isArray(record.state)
      ? (record.state as Record<string, unknown>)
      : record;
  return state.roomStatus === "finished";
}

function findTicketSession(ticket: {
  matchBoardId: string | null;
  sessionId: string | null;
  joinMode?: string;
}, studentId: string) {
  if (!ticket.matchBoardId || !ticket.sessionId) return Promise.resolve(null);
  return db.playSession.findFirst({
    where: {
      id: ticket.sessionId,
      boardId: ticket.matchBoardId,
      current: true,
      ...(ticket.joinMode === "spectator"
        ? {}
        : {
            participants: {
              some: {
                OR: [{ studentId }, { actorSubject: `student:${studentId}` }],
              },
            },
          }),
    },
    select: { completedAtMs: true, state: true },
  });
}

async function responseFor(
  boardId: string,
  classroomId: string,
  studentId: string,
  options: { heartbeatWaiting?: boolean } = {},
) {
  let ticket = await db.omokMatchTicket.findUnique({
    where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId } },
  });
  if (!ticket || ticket.status === "idle") {
    return jsonPrivateNoStore({
      status: "idle",
      playerCount: 0,
      rooms: await listLobbyRooms(boardId, classroomId),
    });
  }
  if (ticket.status === "matched" && ticket.matchBoardId && ticket.sessionId) {
    const [board, session] = await Promise.all([
      db.board.findUnique({
        where: { id: ticket.matchBoardId },
        select: { slug: true },
      }),
      findTicketSession(ticket, studentId),
    ]);
    if (!board || isFinishedSession(session)) {
      await db.omokMatchTicket.update({
        where: { id: ticket.id },
        data: { status: "idle", queueKind: "random", lobbyRoomId: null, opponentStudentId: null, matchBoardId: null, sessionId: null },
      });
      await announceOmokMatchmakingChange(boardId);
      return jsonPrivateNoStore({
        status: "idle",
        playerCount: 0,
        rooms: await listLobbyRooms(boardId, classroomId),
      });
    }
    return jsonPrivateNoStore({
      status: "matched",
      playerCount: await activePlayerCount(boardId),
      queueKind: ticket.queueKind === "room" ? "room" : "random",
      joinMode: ticket.joinMode === "spectator" ? "spectator" : "player",
      lobbyRoomId: ticket.lobbyRoomId,
      sessionId: ticket.sessionId,
      boardSlug: board.slug,
      href: `/board/${encodeURIComponent(board.slug)}?view=student`,
    });
  }
  if (
    ticket.status === "waiting" &&
    ticket.requestedAt.getTime() < Date.now() - WAITING_HEARTBEAT_MS
  ) {
    const expired = await db.omokMatchTicket.updateMany({
      where: {
        id: ticket.id,
        status: "waiting",
        requestedAt: { lt: new Date(Date.now() - WAITING_HEARTBEAT_MS) },
      },
      data: {
        status: "idle",
        queueKind: "random",
        lobbyRoomId: null,
        opponentStudentId: null,
        matchBoardId: null,
        sessionId: null,
        matchedAt: null,
      },
    });
    if (expired.count > 0) {
      if (ticket.queueKind === "room" && ticket.lobbyRoomId) {
        await db.omokLobbyRoom.updateMany({
          where: { id: ticket.lobbyRoomId, status: "waiting" },
          data: { status: "closed" },
        });
      }
      await announceOmokMatchmakingChange(boardId);
      return jsonPrivateNoStore({
        status: "idle",
        playerCount: 0,
        rooms: await listLobbyRooms(boardId, classroomId),
      });
    }
    ticket = await db.omokMatchTicket.findUnique({
      where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId } },
    });
    if (!ticket || ticket.status === "idle") {
      return jsonPrivateNoStore({
        status: "idle",
        playerCount: 0,
        rooms: await listLobbyRooms(boardId, classroomId),
      });
    }
    if (ticket.status !== "waiting") {
      return responseFor(boardId, classroomId, studentId);
    }
  }
  if (
    options.heartbeatWaiting &&
    ticket.status === "waiting" &&
    ticket.requestedAt.getTime() < Date.now() - WAITING_HEARTBEAT_REFRESH_MS
  ) {
    const cutoff = new Date(Date.now() - WAITING_HEARTBEAT_REFRESH_MS);
    await db.omokMatchTicket.updateMany({
      where: {
        id: ticket.id,
        status: "waiting",
        requestedAt: { lt: cutoff },
      },
      data: { requestedAt: new Date() },
    });
  }
  return jsonPrivateNoStore({
    status: "waiting",
    playerCount: ticket.queueKind === "room" ? 1 : await activePlayerCount(boardId),
    queueKind: ticket.queueKind === "room" ? "room" : "random",
    lobbyRoomId: ticket.lobbyRoomId,
    rooms: await listLobbyRooms(boardId, classroomId),
  });
}

async function listLobbyRooms(boardId: string, classroomId: string) {
  const rooms = await db.omokLobbyRoom.findMany({
    where: { lobbyBoardId: boardId, classroomId, status: { in: ["waiting", "active"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (rooms.length === 0) return [];
  // Reconcile durable completion for WebSocket matches too. A missing session
  // during reservation is not a reason to delete an in-progress creation.
  const sessionIds = rooms.flatMap((room) => room.status === "active" && room.sessionId ? [room.sessionId] : []);
  const retired = new Set<string>();
  if (sessionIds.length) {
    const { retireFinishedOmokSession } = await import("@/lib/play-platform/omok-lobby-lifecycle");
    for (const sessionId of sessionIds) {
      if (await retireFinishedOmokSession(sessionId)) retired.add(sessionId);
    }
  }
  const hostIds = rooms.map((room) => room.hostStudentId);
  const [hosts, tickets] = await Promise.all([
    db.student.findMany({
      where: { classroomId, id: { in: hostIds } },
      select: { id: true, name: true },
    }),
    db.omokMatchTicket.findMany({
      where: {
        lobbyBoardId: boardId,
        queueKind: "room",
        lobbyRoomId: { in: rooms.map((room) => room.id) },
        OR: [
          { status: "matched" },
          { status: "waiting", requestedAt: { gte: new Date(Date.now() - WAITING_HEARTBEAT_MS) } },
        ],
      },
      select: { lobbyRoomId: true, joinMode: true, studentId: true },
    }),
  ]);
  const hostNames = new Map(hosts.map((host) => [host.id, host.name]));
  const liveRoomIds = new Set(tickets.flatMap((ticket) => ticket.lobbyRoomId ? [ticket.lobbyRoomId] : []));
  const staleWaitingRoomIds = rooms
    .filter((room) => room.status === "waiting" && !liveRoomIds.has(room.id))
    .map((room) => room.id);
  if (staleWaitingRoomIds.length > 0) {
    await db.omokLobbyRoom.updateMany({
      where: { id: { in: staleWaitingRoomIds }, status: "waiting" },
      data: { status: "closed" },
    });
  }
  return rooms
    .filter((room) => !room.sessionId || !retired.has(room.sessionId))
    .filter((room) => liveRoomIds.has(room.id))
    .map((room) => ({
      id: room.id,
      name: room.name,
      hostName: hostNames.get(room.hostStudentId) ?? "플레이어",
      status: room.status === "active" ? "active" as const : "waiting" as const,
      playerCount: tickets.filter(
        (ticket) => ticket.lobbyRoomId === room.id && ticket.joinMode !== "spectator",
      ).length,
      spectatorCount: tickets.filter(
        (ticket) => ticket.lobbyRoomId === room.id && ticket.joinMode === "spectator",
      ).length,
      createdAt: room.createdAt.toISOString(),
    }));
}

function activePlayerCount(boardId: string) {
  return db.omokMatchTicket.count({
    where: {
      lobbyBoardId: boardId,
      OR: [
        { status: "waiting", requestedAt: { gte: new Date(Date.now() - WAITING_HEARTBEAT_MS) } },
        { status: "matched" },
      ],
    },
  });
}

async function reserveComputerMatch(input: {
  boardId: string;
  classroomId: string;
  teacherId: string;
  studentId: string;
  studentName: string;
}): Promise<MatchReservation> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.boardId}))::text AS "lock"`;
    const matchBoard = await tx.board.create({
      data: {
        slug: `omok-match-${randomUUID()}`,
        title: "오목 · 컴퓨터 대국",
        layout: "omok",
        description: "학생과 컴퓨터의 오목 대국",
        category: BoardCategory.PLAY,
        classroomId: input.classroomId,
        members: { create: { userId: input.teacherId, role: "owner" } },
      },
      select: { id: true },
    });
    const matchedAt = new Date();
    await tx.omokMatchTicket.upsert({
      where: {
        lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
      },
      create: {
        lobbyBoardId: input.boardId,
        classroomId: input.classroomId,
        studentId: input.studentId,
        status: "matched",
        queueKind: "random",
        joinMode: "player",
        lobbyRoomId: null,
        matchBoardId: matchBoard.id,
        matchedAt,
      },
      update: {
        status: "matched",
        queueKind: "random",
        joinMode: "player",
        lobbyRoomId: null,
        opponentStudentId: null,
        matchBoardId: matchBoard.id,
        sessionId: null,
        requestedAt: matchedAt,
        matchedAt,
      },
    });
    return {
      kind: "computer",
      matchBoardId: matchBoard.id,
      classroomId: input.classroomId,
      teacherId: input.teacherId,
      participants: [
        { actorSubject: `student:${input.studentId}`, displayName: input.studentName },
        { actorSubject: OMOK_BOT_ACTOR_SUBJECT, displayName: OMOK_BOT_DISPLAY_NAME },
      ],
    };
  });
}

async function reserveHumanMatch(input: {
  boardId: string;
  classroomId: string;
  teacherId: string;
  studentId: string;
}): Promise<MatchReservation | null> {
  const reservation = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.boardId}))::text AS "lock"`;
    await tx.omokMatchTicket.upsert({
      where: {
        lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
      },
      create: {
        lobbyBoardId: input.boardId,
        classroomId: input.classroomId,
        studentId: input.studentId,
      },
      update: {
        status: "waiting",
        queueKind: "random",
        joinMode: "player",
        lobbyRoomId: null,
        opponentStudentId: null,
        matchBoardId: null,
        sessionId: null,
        requestedAt: new Date(),
        matchedAt: null,
      },
    });
    const opponent = await tx.omokMatchTicket.findFirst({
      where: {
        lobbyBoardId: input.boardId,
        status: "waiting",
        queueKind: "random",
        joinMode: "player",
        lobbyRoomId: null,
        studentId: { not: input.studentId },
        requestedAt: { gte: new Date(Date.now() - WAITING_HEARTBEAT_MS) },
      },
      orderBy: { requestedAt: "asc" },
    });
    if (!opponent) return null;
    const studentIds: [string, string] = [opponent.studentId, input.studentId];
    const matchBoard = await tx.board.create({
      data: {
        slug: `omok-match-${randomUUID()}`,
        title: "오목",
        layout: "omok",
        description: "학생 매칭 대국",
        category: BoardCategory.PLAY,
        classroomId: input.classroomId,
        members: { create: { userId: input.teacherId, role: "owner" } },
      },
      select: { id: true },
    });
    const matchedAt = new Date();
    await tx.omokMatchTicket.update({
      where: { id: opponent.id },
      data: {
        status: "matched",
        opponentStudentId: input.studentId,
        matchBoardId: matchBoard.id,
        matchedAt,
      },
    });
    await tx.omokMatchTicket.update({
      where: {
        lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
      },
      data: {
        status: "matched",
        opponentStudentId: opponent.studentId,
        matchBoardId: matchBoard.id,
        matchedAt,
      },
    });
    return {
      kind: "human" as const,
      matchBoardId: matchBoard.id,
      classroomId: input.classroomId,
      teacherId: input.teacherId,
      studentIds,
    };
  });
  return reservation;
}

async function reserveLobbyRoom(input: {
  boardId: string;
  classroomId: string;
  teacherId: string;
  studentId: string;
  studentName: string;
  roomId?: string;
  roomName?: string;
  joinMode?: "player" | "spectator";
}): Promise<MatchReservation | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.boardId}))::text AS "lock"`;
    if (!input.roomId) {
      await tx.omokLobbyRoom.updateMany({
        where: { lobbyBoardId: input.boardId, hostStudentId: input.studentId, status: "waiting" },
        data: { status: "closed" },
      });
      const room = await tx.omokLobbyRoom.create({
        data: {
          lobbyBoardId: input.boardId,
          classroomId: input.classroomId,
          hostStudentId: input.studentId,
          name: input.roomName ?? `${input.studentName}의 방`,
        },
      });
      await tx.omokMatchTicket.upsert({
        where: {
          lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
        },
        create: {
          lobbyBoardId: input.boardId,
          classroomId: input.classroomId,
          studentId: input.studentId,
          queueKind: "room",
          joinMode: "player",
          lobbyRoomId: room.id,
        },
        update: {
          status: "waiting",
          queueKind: "room",
          joinMode: "player",
          lobbyRoomId: room.id,
          opponentStudentId: null,
          matchBoardId: null,
          sessionId: null,
          requestedAt: new Date(),
          matchedAt: null,
        },
      });
      return null;
    }

    const room = await tx.omokLobbyRoom.findFirst({
      where: {
        id: input.roomId,
        lobbyBoardId: input.boardId,
        classroomId: input.classroomId,
        status: { in: input.joinMode === "spectator" ? ["waiting", "active"] : ["waiting"] },
        hostStudentId: { not: input.studentId },
      },
    });
    if (!room) throw new Error("room_not_found");
    if (input.joinMode === "spectator") {
      if (room.status !== "active" || !room.matchBoardId || !room.sessionId) {
        throw new Error("room_not_active");
      }
      await tx.omokMatchTicket.upsert({
        where: {
          lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
        },
        create: {
          lobbyBoardId: input.boardId,
          classroomId: input.classroomId,
          studentId: input.studentId,
          status: "matched",
          queueKind: "room",
          joinMode: "spectator",
          lobbyRoomId: room.id,
          matchBoardId: room.matchBoardId,
          sessionId: room.sessionId,
          matchedAt: new Date(),
        },
        update: {
          status: "matched",
          queueKind: "room",
          joinMode: "spectator",
          lobbyRoomId: room.id,
          opponentStudentId: null,
          matchBoardId: room.matchBoardId,
          sessionId: room.sessionId,
          requestedAt: new Date(),
          matchedAt: new Date(),
        },
      });
      return null;
    }
    const host = await tx.omokMatchTicket.findFirst({
      where: {
        lobbyBoardId: input.boardId,
        studentId: room.hostStudentId,
        status: "waiting",
        queueKind: "room",
        joinMode: "player",
        lobbyRoomId: room.id,
        requestedAt: { gte: new Date(Date.now() - WAITING_HEARTBEAT_MS) },
      },
    });
    if (!host) throw new Error("room_not_found");

    await tx.omokMatchTicket.upsert({
      where: {
        lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
      },
      create: {
        lobbyBoardId: input.boardId,
        classroomId: input.classroomId,
        studentId: input.studentId,
        queueKind: "room",
        joinMode: "player",
        lobbyRoomId: room.id,
      },
      update: {
        status: "waiting",
        queueKind: "room",
        lobbyRoomId: room.id,
        opponentStudentId: null,
        matchBoardId: null,
        sessionId: null,
        requestedAt: new Date(),
        matchedAt: null,
      },
    });
    const matchBoard = await tx.board.create({
      data: {
        slug: `omok-match-${randomUUID()}`,
        title: "오목",
        layout: "omok",
        description: "학생 초대 대국",
        category: BoardCategory.PLAY,
        classroomId: input.classroomId,
        members: { create: { userId: input.teacherId, role: "owner" } },
      },
      select: { id: true },
    });
    const matchedAt = new Date();
    await tx.omokLobbyRoom.update({
      where: { id: room.id },
      data: { status: "active", matchBoardId: matchBoard.id },
    });
    await tx.omokMatchTicket.update({
      where: { id: host.id },
      data: {
        status: "matched",
        opponentStudentId: input.studentId,
        matchBoardId: matchBoard.id,
        matchedAt,
      },
    });
    await tx.omokMatchTicket.update({
      where: {
        lobbyBoardId_studentId: { lobbyBoardId: input.boardId, studentId: input.studentId },
      },
      data: {
        status: "matched",
        opponentStudentId: host.studentId,
        matchBoardId: matchBoard.id,
        matchedAt,
      },
    });
    return {
      kind: "human" as const,
      matchBoardId: matchBoard.id,
      classroomId: input.classroomId,
      teacherId: input.teacherId,
      studentIds: [host.studentId, input.studentId],
    };
  });
}

async function participantsForReservation(
  reservation: MatchReservation,
): Promise<[ParticipantSeed, ParticipantSeed]> {
  if (reservation.kind === "computer") return reservation.participants;
  const students = await db.student.findMany({
    where: {
      classroomId: reservation.classroomId,
      id: { in: [...reservation.studentIds] },
    },
    select: { id: true, name: true },
  });
  if (students.length !== 2) throw new Error("invalid_participants");
  const byId = new Map(students.map((student) => [student.id, student]));
  return reservation.studentIds.map((studentId) => {
    const student = byId.get(studentId);
    if (!student) throw new Error("invalid_participants");
    return { actorSubject: `student:${student.id}`, displayName: student.name };
  }) as [ParticipantSeed, ParticipantSeed];
}

export async function GET(_request: Request, { params }: Params) {
  const student = await getCurrentStudentIdentity();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { boardId } = await params;
  if (!(await resolveLobby(boardId, student.classroomId))) {
    return jsonPrivateNoStore({ error: "board_not_found" }, { status: 404 });
  }
  return responseFor(boardId, student.classroomId, student.id, { heartbeatWaiting: true });
}

export async function POST(request: Request, { params }: Params) {
  const student = await getCurrentStudentIdentity();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { boardId } = await params;
  const lobby = await resolveLobby(boardId, student.classroomId);
  if (!lobby) return jsonPrivateNoStore({ error: "board_not_found" }, { status: 404 });

  const rawBody = await request.json().catch(() => ({}));
  const parsed = MatchmakingRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonPrivateNoStore({ error: "invalid_request" }, { status: 400 });
  }

  const existing = await db.omokMatchTicket.findUnique({
    where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId: student.id } },
  });
  if (existing?.status === "matched" && existing.matchBoardId) {
    const session = await findTicketSession(existing, student.id);
    if (!isFinishedSession(session)) return responseFor(boardId, student.classroomId, student.id);
  }

  const action = parsed.data.action ?? (parsed.data.opponent === "computer" ? "computer" : "random");
  if (action === "join_room" && !parsed.data.roomId) {
    return jsonPrivateNoStore({ error: "room_id_required" }, { status: 400 });
  }
  let reservation: MatchReservation | null;
  try {
    if (action === "create_room" || action === "join_room") {
      reservation = await reserveLobbyRoom({
        boardId,
        classroomId: student.classroomId,
        teacherId: lobby.teacherId,
        studentId: student.id,
        studentName: student.name,
        roomId: action === "join_room" ? parsed.data.roomId : undefined,
        roomName: parsed.data.roomName,
        joinMode: parsed.data.joinMode ?? "player",
      });
    } else {
      reservation = action === "computer"
        ? await reserveComputerMatch({
            boardId,
            classroomId: student.classroomId,
            teacherId: lobby.teacherId,
            studentId: student.id,
            studentName: student.name,
          })
        : await reserveHumanMatch({
            boardId,
            classroomId: student.classroomId,
            teacherId: lobby.teacherId,
            studentId: student.id,
          });
    }
  } catch (error) {
    console.error("[POST omok matchmaking reserve]", error);
    return jsonPrivateNoStore(
      {
        error: error instanceof Error && ["room_not_found", "room_not_active"].includes(error.message)
          ? error.message
          : "match_reservation_failed",
        ...(process.env.NODE_ENV === "development" && error instanceof Error
          ? { detail: error.message }
          : {}),
      },
      {
        status: error instanceof Error && error.message === "room_not_found"
          ? 404
          : error instanceof Error && error.message === "room_not_active"
            ? 409
            : 503,
      },
    );
  }

  if (!reservation) {
    await announceOmokMatchmakingChange(boardId);
    return responseFor(boardId, student.classroomId, student.id);
  }

  try {
    const participants = await participantsForReservation(reservation);
    const sessionId = await createStartedMatch({
      matchBoardId: reservation.matchBoardId,
      teacherId: reservation.teacherId,
      participants,
    });
    await db.omokMatchTicket.updateMany({
      where: { lobbyBoardId: boardId, matchBoardId: reservation.matchBoardId },
      data: { sessionId },
    });
    await db.omokLobbyRoom.updateMany({
      where: { lobbyBoardId: boardId, matchBoardId: reservation.matchBoardId },
      data: { sessionId },
    });
    await announceOmokMatchmakingChange(boardId);
  } catch (error) {
    await db.$transaction([
      db.omokMatchTicket.updateMany({
        where: { lobbyBoardId: boardId, matchBoardId: reservation.matchBoardId },
        data: {
          status: reservation.kind === "computer" ? "idle" : "waiting",
          ...(reservation.kind === "computer" ? { queueKind: "random", lobbyRoomId: null } : {}),
          opponentStudentId: null,
          matchBoardId: null,
          sessionId: null,
          matchedAt: null,
        },
      }),
      db.board.delete({ where: { id: reservation.matchBoardId } }),
    ]).catch(() => undefined);
    await announceOmokMatchmakingChange(boardId);
    console.error("[POST omok matchmaking]", error);
    return jsonPrivateNoStore({ error: "match_creation_failed" }, { status: 503 });
  }
  return responseFor(boardId, student.classroomId, student.id);
}

export async function DELETE(_request: Request, { params }: Params) {
  const student = await getCurrentStudentIdentity();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { boardId } = await params;
  await db.$transaction([
    db.omokMatchTicket.updateMany({
      where: { lobbyBoardId: boardId, studentId: student.id, status: "waiting" },
      data: {
        status: "idle",
        queueKind: "random",
        lobbyRoomId: null,
        opponentStudentId: null,
        matchBoardId: null,
        sessionId: null,
        matchedAt: null,
      },
    }),
    db.omokLobbyRoom.updateMany({
      where: {
        lobbyBoardId: boardId,
        hostStudentId: student.id,
        status: "waiting",
      },
      data: { status: "closed" },
    }),
  ]);
  await announceOmokMatchmakingChange(boardId);
  return jsonPrivateNoStore({ status: "idle", playerCount: 0 });
}
