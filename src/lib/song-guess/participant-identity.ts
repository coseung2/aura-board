import "server-only";

import { db } from "@/lib/db";
import type {
  SongGuessRepresentativePet,
  SongGuessSnapshot,
} from "./contracts";

type ParticipantRow = {
  actorSubject: string;
  studentId: string | null;
  slot: string;
};

type StudentWithRepresentative = {
  id: string;
  slimes: Array<{
    color: string;
    growthStage: number;
    equippedItemKeys: string[];
    hiddenItemKeys: string[];
    equippedTitleKey: string | null;
  }>;
};

/**
 * Adds classroom-scoped student identity and representative pet data to an
 * engine snapshot. The Rust engine intentionally exposes only display names;
 * PlayParticipant's numeric player slot preserves the exact participant order
 * used by the engine, so duplicate display names never affect this mapping.
 */
export async function enrichSongGuessSnapshot(
  snapshot: SongGuessSnapshot,
): Promise<SongGuessSnapshot> {
  const session = await db.playSession.findUnique({
    where: { id: snapshot.sessionId },
    select: {
      boardId: true,
      gameKind: true,
      board: { select: { classroomId: true } },
      participants: {
        select: { actorSubject: true, studentId: true, slot: true },
      },
    },
  });

  if (
    !session ||
    session.gameKind !== "song-guess" ||
    session.boardId !== snapshot.boardId ||
    !session.board.classroomId ||
    session.participants.length !== snapshot.participants.length ||
    !hasContiguousPlayerSlots(session.participants)
  ) {
    return snapshot;
  }

  const orderedParticipants = [...session.participants].sort(comparePlayerSlots);
  const studentIds = orderedParticipants.map(resolveStudentId);
  if (studentIds.some((studentId) => !studentId)) return snapshot;

  const students = (await db.student.findMany({
    where: {
      classroomId: session.board.classroomId,
      id: { in: studentIds as string[] },
    },
    select: {
      id: true,
      slimes: {
        where: { isRepresentative: true },
        take: 1,
        select: {
          color: true,
          growthStage: true,
          equippedItemKeys: true,
          hiddenItemKeys: true,
          equippedTitleKey: true,
        },
      },
    },
  })) as StudentWithRepresentative[];
  const studentsById = new Map(students.map((student) => [student.id, student]));

  return {
    ...snapshot,
    participants: snapshot.participants.map((participant, index) => {
      const studentId = studentIds[index];
      const student = studentId ? studentsById.get(studentId) : undefined;
      // A student missing from the session classroom is deliberately left
      // untouched. This prevents a malformed or stale session from leaking a
      // pet from another classroom into a scoreboard.
      if (!studentId || !student) return participant;
      return {
        ...participant,
        participantId: studentId,
        representativePet: representativePetFor(student),
      };
    }),
  };
}

function resolveStudentId(participant: ParticipantRow): string | null {
  if (participant.studentId?.trim()) return participant.studentId;
  const match = /^student:([A-Za-z0-9_-]{1,255})$/.exec(participant.actorSubject);
  return match?.[1] ?? null;
}

function comparePlayerSlots(left: ParticipantRow, right: ParticipantRow): number {
  const leftIndex = playerSlotIndex(left.slot);
  const rightIndex = playerSlotIndex(right.slot);
  if (leftIndex !== null && rightIndex !== null) return leftIndex - rightIndex;
  if (leftIndex !== null) return -1;
  if (rightIndex !== null) return 1;
  return left.slot.localeCompare(right.slot);
}

function hasContiguousPlayerSlots(participants: readonly ParticipantRow[]): boolean {
  const indexes = participants
    .map((participant) => playerSlotIndex(participant.slot))
    .filter((index): index is number => index !== null)
    .sort((left, right) => left - right);
  return (
    indexes.length === participants.length &&
    indexes.every((index, position) => index === position)
  );
}

function playerSlotIndex(slot: string): number | null {
  const match = /^player:(0|[1-9]\d*)$/.exec(slot);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function representativePetFor(
  student: StudentWithRepresentative,
): SongGuessRepresentativePet | null {
  const representative = student.slimes[0];
  if (!representative || !representative.color.trim()) return null;
  const growthStage = [1, 2, 3].includes(representative.growthStage)
    ? (representative.growthStage as 1 | 2 | 3)
    : 1;
  return {
    color: representative.color,
    growthStage,
    equippedItemKeys: [...representative.equippedItemKeys],
    hiddenItemKeys: [...representative.hiddenItemKeys].filter((key) =>
      representative.equippedItemKeys.includes(key),
    ),
    equippedTitleKey: representative.equippedTitleKey ?? null,
  };
}
