import "server-only";

import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { OfficialGameKind } from "./contracts";
import { OFFICIAL_GAME_CATALOG } from "./catalog";

export type GameHubStudentScope = {
  id: string;
  classroomId: string;
};

export type CanonicalGameRoom = {
  id: string;
  slug: string;
  layout: OfficialGameKind;
  classroomId: string;
  systemGameKind: OfficialGameKind;
};

function stableRoomSlug(classroomId: string, gameKind: OfficialGameKind): string {
  const classroomHash = createHash("sha256")
    .update(classroomId)
    .digest("hex")
    .slice(0, 16);
  return `game-hub-${gameKind}-${classroomHash}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

async function loadClassroomTeacherId(classroomId: string): Promise<string> {
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) throw new Error("game_hub_classroom_not_found");
  return classroom.teacherId;
}

async function ensureTeacherOwnership(
  roomId: string,
  teacherId: string,
): Promise<void> {
  await db.boardMember.upsert({
    where: { boardId_userId: { boardId: roomId, userId: teacherId } },
    update: { role: "owner" },
    create: { boardId: roomId, userId: teacherId, role: "owner" },
  });
}

async function findCanonicalRoom(
  classroomId: string,
  gameKind: OfficialGameKind,
): Promise<CanonicalGameRoom | null> {
  const room = await db.board.findFirst({
    where: { classroomId, systemGameKind: gameKind },
    select: {
      id: true,
      slug: true,
      layout: true,
      classroomId: true,
      systemGameKind: true,
    },
  });
  if (!room) return null;
  if (
    room.classroomId !== classroomId ||
    room.layout !== gameKind ||
    room.systemGameKind !== gameKind
  ) {
    throw new Error("invalid_canonical_game_room");
  }
  return room as CanonicalGameRoom;
}

/**
 * Resolve the stable classroom-owned room used by the first-class game hub.
 *
 * The client supplies only the canonical game kind. Classroom identity comes
 * from the authenticated student, and the database unique key serializes the
 * first-entry race between web and mobile. No score, timing, participant, host,
 * or runtime state is accepted here.
 */
export async function resolveOrCreateCanonicalGameRoom(
  student: GameHubStudentScope,
  gameKind: OfficialGameKind,
): Promise<CanonicalGameRoom> {
  const teacherId = await loadClassroomTeacherId(student.classroomId);
  const existing = await findCanonicalRoom(student.classroomId, gameKind);
  if (existing) {
    await ensureTeacherOwnership(existing.id, teacherId);
    return existing;
  }

  const catalog = OFFICIAL_GAME_CATALOG[gameKind];
  try {
    const room = await db.board.create({
      data: {
        slug: stableRoomSlug(student.classroomId, gameKind),
        title: catalog.label,
        description: catalog.description,
        layout: gameKind,
        category: "PLAY",
        classroomId: student.classroomId,
        systemGameKind: gameKind,
        thumbnailMode: "none",
        members: {
          create: { userId: teacherId, role: "owner" },
        },
      },
      select: {
        id: true,
        slug: true,
        layout: true,
        classroomId: true,
        systemGameKind: true,
      },
    });
    return room as CanonicalGameRoom;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await findCanonicalRoom(student.classroomId, gameKind);
    if (raced) {
      await ensureTeacherOwnership(raced.id, teacherId);
      return raced;
    }
    throw error;
  }
}
