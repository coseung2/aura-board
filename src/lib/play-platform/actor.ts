import "server-only";

import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudentRaw } from "@/lib/student-auth";
import type { PlayActorRole } from "./contracts";

export type PlayActor = {
  subject: string;
  role: PlayActorRole;
  userId: string | null;
  studentId: string | null;
};

export class PlayAccessError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function resolvePlayActor(): Promise<PlayActor> {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    return {
      subject: `teacher:${user.id}`,
      role: "host",
      userId: user.id,
      studentId: null,
    };
  }
  const student = await getCurrentStudentRaw();
  if (student) {
    return {
      subject: `student:${student.id}`,
      role: "participant",
      userId: null,
      studentId: student.id,
    };
  }
  throw new PlayAccessError(401, "unauthorized");
}

export async function resolvePlayActorForBoard(boardId: string): Promise<{
  actor: PlayActor;
  board: { id: string; classroomId: string };
}> {
  const actor = await resolvePlayActor();
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      layout: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board || board.layout !== "omok" || !board.classroomId) {
    throw new PlayAccessError(404, "play_board_not_found");
  }

  if (actor.role === "host") {
    const member = await db.boardMember.findFirst({
      where: {
        boardId,
        userId: actor.userId ?? "",
        role: { in: ["owner", "editor"] },
      },
      select: { id: true },
    });
    if (board.classroom?.teacherId !== actor.userId && !member) {
      throw new PlayAccessError(403, "forbidden");
    }
  } else {
    const student = await db.student.findUnique({
      where: { id: actor.studentId ?? "" },
      select: { classroomId: true },
    });
    if (student?.classroomId !== board.classroomId) {
      throw new PlayAccessError(403, "forbidden");
    }
  }

  return {
    actor,
    board: { id: board.id, classroomId: board.classroomId },
  };
}

/** Song-guess is a board-owned play surface but has no UI layout dependency. */
export async function resolveSongGuessActorForBoard(boardId: string): Promise<{
  actor: PlayActor;
  board: { id: string; classroomId: string };
}> {
  const actor = await resolvePlayActor();
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board || !board.classroomId) {
    throw new PlayAccessError(404, "song_guess_board_not_found");
  }

  if (actor.role === "host") {
    const member = await db.boardMember.findFirst({
      where: {
        boardId,
        userId: actor.userId ?? "",
        role: { in: ["owner", "editor"] },
      },
      select: { id: true },
    });
    if (board.classroom?.teacherId !== actor.userId && !member) {
      throw new PlayAccessError(403, "forbidden");
    }
  } else {
    const student = await db.student.findUnique({
      where: { id: actor.studentId ?? "" },
      select: { classroomId: true },
    });
    if (student?.classroomId !== board.classroomId) {
      throw new PlayAccessError(403, "forbidden");
    }
  }

  return {
    actor,
    board: { id: board.id, classroomId: board.classroomId },
  };
}

export async function loadSongGuessTeacherBoard(boardId: string) {
  const { actor, board } = await resolveSongGuessActorForBoard(boardId);
  if (actor.role !== "host") throw new PlayAccessError(403, "forbidden");
  return { actor, board };
}

export async function resolveSongGuessParticipantSeeds(
  boardId: string,
  studentIds?: readonly string[],
): Promise<Array<{ actorSubject: string; displayName: string }>> {
  const { actor, board } = await loadSongGuessTeacherBoard(boardId);
  void actor;
  const uniqueIds = [...new Set(studentIds ?? [])];
  const students = await db.student.findMany({
    where: {
      classroomId: board.classroomId,
      ...(uniqueIds.length > 0 ? { id: { in: uniqueIds } } : {}),
    },
    orderBy: [{ number: "asc" }, { name: "asc" }],
    take: 100,
    select: { id: true, name: true },
  });
  if (uniqueIds.length > 0 && students.length !== uniqueIds.length) {
    throw new PlayAccessError(400, "invalid_participants");
  }
  if (students.length === 0) throw new PlayAccessError(400, "no_students_available");
  return students.map((student) => ({
    actorSubject: `student:${student.id}`,
    displayName: student.name,
  }));
}

export async function loadOmokRoster(boardId: string) {
  const { actor, board } = await resolvePlayActorForBoard(boardId);
  if (actor.role !== "host") throw new PlayAccessError(403, "forbidden");
  return db.student.findMany({
    where: { classroomId: board.classroomId },
    orderBy: [{ number: "asc" }, { name: "asc" }],
    select: { id: true, name: true, number: true },
  });
}

export async function resolveOmokParticipantSeeds(
  boardId: string,
  studentIds: readonly string[],
): Promise<Array<{ actorSubject: string; displayName: string }>> {
  const { actor, board } = await resolvePlayActorForBoard(boardId);
  if (actor.role !== "host") throw new PlayAccessError(403, "forbidden");
  const uniqueIds = [...new Set(studentIds)];
  if (uniqueIds.length !== 2) throw new PlayAccessError(400, "two_students_required");
  const students = await db.student.findMany({
    where: { id: { in: uniqueIds }, classroomId: board.classroomId },
    select: { id: true, name: true },
  });
  if (students.length !== 2) throw new PlayAccessError(400, "invalid_participants");
  const byId = new Map(students.map((student) => [student.id, student]));
  return uniqueIds.map((id) => {
    const student = byId.get(id);
    if (!student) throw new PlayAccessError(400, "invalid_participants");
    return { actorSubject: `student:${student.id}`, displayName: student.name };
  });
}

export function signPlayActorAssertion(actor: PlayActor, nowMs = Date.now()): string {
  const secret = process.env.PLAY_ENGINE_ASSERTION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("PLAY_ENGINE_ASSERTION_SECRET must be at least 32 bytes");
  }
  const payload = Buffer.from(
    JSON.stringify({
      actorSubject: actor.subject,
      role: actor.role,
      expiresAtMs: nowMs + 30_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
