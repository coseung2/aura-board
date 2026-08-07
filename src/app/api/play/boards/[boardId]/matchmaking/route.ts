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
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };
const WAITING_HEARTBEAT_MS = 30_000;
const MatchmakingRequestSchema = z
  .object({ opponent: z.enum(["human", "computer"]).optional() })
  .strict();

type ParticipantSeed = { actorSubject: string; displayName: string };
type MatchReservation = {
  kind: "human" | "computer";
  matchBoardId: string;
  teacherId: string;
  participants: [ParticipantSeed, ParticipantSeed];
};

async function resolveLobby(boardId: string, classroomId: string) {
  return db.board.findFirst({
    where: {
      id: boardId,
      classroomId,
      layout: "omok",
      systemGameKind: "omok",
    },
    select: { id: true, classroomId: true },
  });
}

function participantActor(actorSubject: string): PlayActor {
  const studentId = actorSubject.startsWith("student:")
    ? actorSubject.slice("student:".length)
    : null;
  return {
    subject: actorSubject,
    role: "participant",
    userId: null,
    studentId,
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
      },
    },
  );
  if (!created.ok) throw new Error(`omok_match_create_${created.status}`);
  const createdBody = await engineJson(created);
  const snapshot = createdBody?.snapshot as { sessionId?: string; version?: number } | undefined;
  if (!snapshot?.sessionId || !Number.isSafeInteger(snapshot.version)) {
    throw new Error("omok_match_invalid_create");
  }

  let version = Number(snapshot.version);
  for (const participant of input.participants) {
    const ready = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(snapshot.sessionId)}/commands`,
      {
        actor: participantActor(participant.actorSubject),
        method: "POST",
        body: {
          requestId: `omok-ready-${input.matchBoardId}-${participant.actorSubject.replaceAll(":", "-")}`,
          expectedVersion: version,
          commandSchemaVersion: 1,
          command: { type: "ready" },
        },
      },
    );
    if (!ready.ok) throw new Error(`omok_match_ready_${ready.status}`);
    const readyBody = await engineJson(ready);
    const nextVersion = Number(readyBody?.version);
    if (!Number.isSafeInteger(nextVersion)) throw new Error("omok_match_invalid_ready");
    version = nextVersion;
  }
  const started = await playEngineFetch(
    `/v1/sessions/${encodeURIComponent(snapshot.sessionId)}/commands`,
    {
      actor: host,
      method: "POST",
      body: {
        requestId: `omok-start-${input.matchBoardId}`,
        expectedVersion: version,
        commandSchemaVersion: 1,
        command: { type: "start" },
      },
    },
  );
  if (!started.ok) throw new Error(`omok_match_start_${started.status}`);
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

async function responseFor(boardId: string, studentId: string) {
  const ticket = await db.omokMatchTicket.findUnique({
    where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId } },
  });
  if (!ticket || ticket.status === "idle") {
    return jsonPrivateNoStore({ status: "idle", playerCount: 0 });
  }
  if (ticket.status === "matched" && ticket.matchBoardId && ticket.sessionId) {
    const [board, session] = await Promise.all([
      db.board.findUnique({
        where: { id: ticket.matchBoardId },
        select: { slug: true },
      }),
      db.playSession.findFirst({
        where: { boardId: ticket.matchBoardId, current: true },
        select: { completedAtMs: true, state: true },
      }),
    ]);
    if (!board || isFinishedSession(session)) {
      await db.omokMatchTicket.update({
        where: { id: ticket.id },
        data: { status: "idle", opponentStudentId: null, matchBoardId: null, sessionId: null },
      });
      await announceOmokMatchmakingChange(boardId);
      return jsonPrivateNoStore({ status: "idle", playerCount: 0 });
    }
    return jsonPrivateNoStore({
      status: "matched",
      playerCount: await activePlayerCount(boardId),
      sessionId: ticket.sessionId,
      boardSlug: board.slug,
      href: `/board/${encodeURIComponent(board.slug)}?view=student`,
    });
  }
  return jsonPrivateNoStore({ status: "waiting", playerCount: await activePlayerCount(boardId) });
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
  studentId: string;
  studentName: string;
}): Promise<MatchReservation> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.boardId}))::text AS "lock"`;
    const classroom = await tx.classroom.findUnique({
      where: { id: input.classroomId },
      select: { teacherId: true },
    });
    if (!classroom) throw new Error("classroom_not_found");
    const matchBoard = await tx.board.create({
      data: {
        slug: `omok-match-${randomUUID()}`,
        title: "오목 · 컴퓨터 대국",
        layout: "omok",
        description: "학생과 컴퓨터의 오목 대국",
        category: BoardCategory.PLAY,
        classroomId: input.classroomId,
        members: { create: { userId: classroom.teacherId, role: "owner" } },
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
        matchBoardId: matchBoard.id,
        matchedAt,
      },
      update: {
        status: "matched",
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
      teacherId: classroom.teacherId,
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
        studentId: { not: input.studentId },
        requestedAt: { gte: new Date(Date.now() - WAITING_HEARTBEAT_MS) },
      },
      orderBy: { requestedAt: "asc" },
    });
    if (!opponent) return null;
    const classroom = await tx.classroom.findUnique({
      where: { id: input.classroomId },
      select: { teacherId: true },
    });
    if (!classroom) throw new Error("classroom_not_found");
    const studentIds = [opponent.studentId, input.studentId] as const;
    const students = await tx.student.findMany({
      where: { classroomId: input.classroomId, id: { in: [...studentIds] } },
      select: { id: true, name: true },
    });
    if (students.length !== 2) throw new Error("invalid_participants");
    const byId = new Map(students.map((student) => [student.id, student]));
    const participants = studentIds.map((studentId) => {
      const current = byId.get(studentId);
      if (!current) throw new Error("invalid_participants");
      return { actorSubject: `student:${current.id}`, displayName: current.name };
    }) as [ParticipantSeed, ParticipantSeed];
    const matchBoard = await tx.board.create({
      data: {
        slug: `omok-match-${randomUUID()}`,
        title: "오목",
        layout: "omok",
        description: "학생 매칭 대국",
        category: BoardCategory.PLAY,
        classroomId: input.classroomId,
        members: { create: { userId: classroom.teacherId, role: "owner" } },
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
      teacherId: classroom.teacherId,
      participants,
    };
  });
  return reservation;
}

export async function GET(_request: Request, { params }: Params) {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { boardId } = await params;
  if (!(await resolveLobby(boardId, student.classroomId))) {
    return jsonPrivateNoStore({ error: "board_not_found" }, { status: 404 });
  }
  await db.omokMatchTicket.updateMany({
    where: { lobbyBoardId: boardId, studentId: student.id, status: "waiting" },
    data: { requestedAt: new Date() },
  });
  return responseFor(boardId, student.id);
}

export async function POST(request: Request, { params }: Params) {
  const student = await getCurrentStudent();
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
    const session = await db.playSession.findFirst({
      where: { boardId: existing.matchBoardId, current: true },
      select: { completedAtMs: true, state: true },
    });
    if (!isFinishedSession(session)) return responseFor(boardId, student.id);
  }

  let reservation: MatchReservation | null;
  try {
    reservation =
      parsed.data.opponent === "computer"
        ? await reserveComputerMatch({
            boardId,
            classroomId: student.classroomId,
            studentId: student.id,
            studentName: student.name,
          })
        : await reserveHumanMatch({
            boardId,
            classroomId: student.classroomId,
            studentId: student.id,
          });
  } catch (error) {
    console.error("[POST omok matchmaking reserve]", error);
    return jsonPrivateNoStore(
      {
        error: "match_reservation_failed",
        ...(process.env.NODE_ENV === "development" && error instanceof Error
          ? { detail: error.message }
          : {}),
      },
      { status: 503 },
    );
  }

  if (!reservation) {
    await announceOmokMatchmakingChange(boardId);
    return responseFor(boardId, student.id);
  }

  try {
    const sessionId = await createStartedMatch(reservation);
    await db.omokMatchTicket.updateMany({
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
  return responseFor(boardId, student.id);
}

export async function DELETE(_request: Request, { params }: Params) {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { boardId } = await params;
  await db.omokMatchTicket.updateMany({
    where: { lobbyBoardId: boardId, studentId: student.id, status: "waiting" },
    data: { status: "idle" },
  });
  await announceOmokMatchmakingChange(boardId);
  return jsonPrivateNoStore({ status: "idle", playerCount: 0 });
}
