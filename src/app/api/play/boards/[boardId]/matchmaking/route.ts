import { randomUUID } from "node:crypto";
import { BoardCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { resolveOmokParticipantSeeds } from "@/lib/play-platform/actor";
import type { PlayActor } from "@/lib/play-platform/actor";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };
const WAITING_HEARTBEAT_MS = 30_000;

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

function participantActor(studentId: string): PlayActor {
  return {
    subject: `student:${studentId}`,
    role: "participant",
    userId: null,
    studentId,
  };
}

async function engineJson(response: Response) {
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

async function createStartedMatch(input: {
  lobbyBoardId: string;
  matchBoardId: string;
  firstStudentId: string;
  secondStudentId: string;
  teacherId: string;
}) {
  const host: PlayActor = {
    subject: `teacher:${input.teacherId}`,
    role: "host",
    userId: input.teacherId,
    studentId: null,
  };
  const participants = await resolveOmokParticipantSeeds(input.matchBoardId, [
    input.firstStudentId,
    input.secondStudentId,
  ]);
  const created = await playEngineFetch(
    `/v1/boards/${encodeURIComponent(input.matchBoardId)}/sessions`,
    {
      actor: host,
      method: "POST",
      body: {
        requestId: `omok-match-${input.matchBoardId}`,
        participants,
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
  for (const studentId of [input.firstStudentId, input.secondStudentId]) {
    const ready = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(snapshot.sessionId)}/commands`,
      {
        actor: participantActor(studentId),
        method: "POST",
        body: {
          requestId: `omok-ready-${input.matchBoardId}-${studentId}`,
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
        select: { completedAtMs: true },
      }),
    ]);
    if (!board || !session || session.completedAtMs != null) {
      await db.omokMatchTicket.update({
        where: { id: ticket.id },
        data: { status: "idle", opponentStudentId: null, matchBoardId: null, sessionId: null },
      });
      return jsonPrivateNoStore({ status: "idle", playerCount: 0 });
    }
    const playerCount = await activePlayerCount(boardId);
    return jsonPrivateNoStore({
      status: "matched",
      playerCount,
      sessionId: ticket.sessionId,
      href: board ? `/board/${encodeURIComponent(board.slug)}?view=student` : null,
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

export async function POST(_request: Request, { params }: Params) {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { boardId } = await params;
  const lobby = await resolveLobby(boardId, student.classroomId);
  if (!lobby) return jsonPrivateNoStore({ error: "board_not_found" }, { status: 404 });

  const existing = await db.omokMatchTicket.findUnique({
    where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId: student.id } },
  });
  if (existing?.status === "matched" && existing.matchBoardId) {
    const session = await db.playSession.findFirst({
      where: { boardId: existing.matchBoardId, current: true },
      select: { completedAtMs: true },
    });
    if (session && session.completedAtMs == null) return responseFor(boardId, student.id);
  }

  const reservation = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${boardId}))`;
    await tx.omokMatchTicket.upsert({
      where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId: student.id } },
      create: { lobbyBoardId: boardId, classroomId: student.classroomId, studentId: student.id },
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
        lobbyBoardId: boardId,
        status: "waiting",
        studentId: { not: student.id },
        requestedAt: { gte: new Date(Date.now() - WAITING_HEARTBEAT_MS) },
      },
      orderBy: { requestedAt: "asc" },
    });
    if (!opponent) return null;
    const classroom = await tx.classroom.findUnique({
      where: { id: student.classroomId },
      select: { teacherId: true },
    });
    if (!classroom) throw new Error("classroom_not_found");
    const matchBoard = await tx.board.create({
      data: {
        slug: `omok-match-${randomUUID()}`,
        title: "오목",
        layout: "omok",
        description: "학생 매칭 대국",
        category: BoardCategory.PLAY,
        classroomId: student.classroomId,
        members: { create: { userId: classroom.teacherId, role: "owner" } },
      },
      select: { id: true },
    });
    const matchedAt = new Date();
    await tx.omokMatchTicket.update({
      where: { id: opponent.id },
      data: { status: "matched", opponentStudentId: student.id, matchBoardId: matchBoard.id, matchedAt },
    });
    await tx.omokMatchTicket.update({
      where: { lobbyBoardId_studentId: { lobbyBoardId: boardId, studentId: student.id } },
      data: { status: "matched", opponentStudentId: opponent.studentId, matchBoardId: matchBoard.id, matchedAt },
    });
    return {
      matchBoardId: matchBoard.id,
      firstStudentId: opponent.studentId,
      secondStudentId: student.id,
      teacherId: classroom.teacherId,
    };
  });

  if (!reservation) return responseFor(boardId, student.id);
  try {
    const sessionId = await createStartedMatch({ lobbyBoardId: boardId, ...reservation });
    await db.omokMatchTicket.updateMany({
      where: { lobbyBoardId: boardId, matchBoardId: reservation.matchBoardId },
      data: { sessionId },
    });
  } catch (error) {
    await db.$transaction([
      db.omokMatchTicket.updateMany({
        where: { lobbyBoardId: boardId, matchBoardId: reservation.matchBoardId },
        data: { status: "waiting", opponentStudentId: null, matchBoardId: null, sessionId: null, matchedAt: null },
      }),
      db.board.delete({ where: { id: reservation.matchBoardId } }),
    ]).catch(() => undefined);
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
  return jsonPrivateNoStore({ status: "idle", playerCount: 0 });
}
