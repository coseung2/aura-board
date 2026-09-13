import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { saveBoardDefaultGroups } from "@/lib/default-groups";
import {
  createSpeedGameRun,
  DEFAULT_SPEED_GAME_TIME_LIMIT_MS,
  deriveSpeedGameGuesserSlot,
  validSpeedGameTimeLimitMs,
} from "@/lib/speed-game/runtime";
import { normalizeKeyword } from "@/lib/speed-game/score";
import { KORDLE_WORD_LENGTH } from "@/features/kordle/server/kordleWords";
import type { OfficialGameKind } from "./contracts";
import { OFFICIAL_GAME_CATALOG } from "./catalog";

export type GameHubClassroomScope = {
  classroomId: string;
  id?: string;
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

const CANONICAL_SPEED_GAME_KEYWORDS = ["학교", "친구"] as const;

async function ensureCanonicalKordle(
  tx: Prisma.TransactionClient,
  roomId: string,
): Promise<void> {
  await tx.kordleGame.upsert({
    where: { boardId: roomId },
    update: {
      title: "꼬들",
      locale: "ko-KR",
      wordLength: KORDLE_WORD_LENGTH,
      maxGuesses: 6,
      mode: "LIVE_CLASS",
    },
    create: {
      boardId: roomId,
      title: "꼬들",
      locale: "ko-KR",
      wordLength: KORDLE_WORD_LENGTH,
      maxGuesses: 6,
      mode: "LIVE_CLASS",
    },
  });
}

async function ensureCanonicalSpeedGame(
  tx: Prisma.TransactionClient,
  roomId: string,
  classroomId: string,
): Promise<void> {
  const roster = await tx.student.findMany({
    where: { classroomId },
    orderBy: [{ number: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const existingGroups = await tx.boardDefaultGroup.findMany({
    where: { boardId: roomId },
    orderBy: { order: "asc" },
    include: { members: { select: { studentId: true } } },
  });
  let groupSizes = existingGroups.map((group) => group.members.length);
  if (existingGroups.length === 0 || groupSizes.some((size) => size === 0)) {
    await saveBoardDefaultGroups(tx, roomId, [
      { name: "1모둠", studentIds: roster.map((student) => student.id) },
    ]);
    groupSizes = [roster.length];
  }
  const smallestGroupSize = Math.max(1, Math.min(...groupSizes));

  const existingGame = await tx.speedGame.findUnique({
    where: { boardId: roomId },
    select: { id: true, timeLimitMs: true },
  });
  const invalidExistingTimeLimit = Boolean(
    existingGame &&
      existingGame.timeLimitMs !== validSpeedGameTimeLimitMs(existingGame.timeLimitMs),
  );
  let game: { id: string };
  if (!existingGame) {
    game = await tx.speedGame.create({
        data: {
          boardId: roomId,
          status: "lobby",
          roundIndex: -1,
          answerMode: "normalize-space",
          baseScore: 1000,
          minScore: 0,
          bonusRanks: "300,200,100",
          timeLimitMs: DEFAULT_SPEED_GAME_TIME_LIMIT_MS,
        },
        select: { id: true },
      });
  } else if (invalidExistingTimeLimit) {
    game = await tx.speedGame.update({
      where: { id: existingGame.id },
      data: { timeLimitMs: DEFAULT_SPEED_GAME_TIME_LIMIT_MS },
      select: { id: true },
    });
  } else {
    game = existingGame;
  }

  for (const [order, keyword] of CANONICAL_SPEED_GAME_KEYWORDS.entries()) {
    await tx.speedGameRound.upsert({
      where: { gameId_order: { gameId: game.id, order } },
      update: { guesserSlot: deriveSpeedGameGuesserSlot(order, smallestGroupSize) },
      create: {
        gameId: game.id,
        order,
        keyword,
        keywordNormalized: normalizeKeyword(keyword),
        guesserSlot: deriveSpeedGameGuesserSlot(order, smallestGroupSize),
      },
    });
  }
  const rounds = await tx.speedGameRound.findMany({
    where: { gameId: game.id },
    select: { id: true, order: true, guesserSlot: true },
  });
  for (const round of rounds) {
    const guesserSlot = deriveSpeedGameGuesserSlot(round.order, smallestGroupSize);
    if (round.guesserSlot !== guesserSlot) {
      await tx.speedGameRound.update({
        where: { id: round.id },
        data: { guesserSlot },
      });
    }
  }
  const currentRun = await tx.speedGameRun.findFirst({
    where: { gameId: game.id, current: true },
    select: { id: true },
  });
  if (!currentRun || invalidExistingTimeLimit) {
    await createSpeedGameRun(tx, {
      gameId: game.id,
      previousRunId: currentRun?.id ?? null,
    });
  }
}

function needsCanonicalRuntime(gameKind: OfficialGameKind): boolean {
  return gameKind === "speed-game" || gameKind === "kordle";
}

async function ensureCanonicalRuntime(
  tx: Prisma.TransactionClient,
  roomId: string,
  classroomId: string,
  gameKind: OfficialGameKind,
): Promise<void> {
  if (gameKind === "speed-game") {
    await ensureCanonicalSpeedGame(tx, roomId, classroomId);
  } else if (gameKind === "kordle") {
    await ensureCanonicalKordle(tx, roomId);
  }
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
 * The client supplies only the canonical game kind. Classroom identity is
 * resolved from an authenticated student or an ownership-checked teacher
 * request, and the database unique key serializes the first-entry race between
 * clients. No score, timing, participant, host, or runtime state is accepted.
 */
export async function resolveOrCreateCanonicalGameRoom(
  scope: GameHubClassroomScope,
  gameKind: OfficialGameKind,
  options: { allowCreate?: boolean } = {},
): Promise<CanonicalGameRoom> {
  const teacherId = await loadClassroomTeacherId(scope.classroomId);
  const existing = await findCanonicalRoom(scope.classroomId, gameKind);
  if (existing) {
    await ensureTeacherOwnership(existing.id, teacherId);
    if (needsCanonicalRuntime(gameKind)) {
      await db.$transaction((tx) =>
        ensureCanonicalRuntime(tx, existing.id, scope.classroomId, gameKind),
      );
    }
    return existing;
  }

  if (options.allowCreate === false) throw new Error("teacher_room_not_open");

  const catalog = OFFICIAL_GAME_CATALOG[gameKind];
  try {
    const createRoom = async (tx: Prisma.TransactionClient | typeof db) => {
      const created = await tx.board.create({
        data: {
          slug: stableRoomSlug(scope.classroomId, gameKind),
          title: catalog.label,
          description: catalog.description,
          layout: gameKind,
          category: "PLAY",
          classroomId: scope.classroomId,
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
      if (needsCanonicalRuntime(gameKind)) {
        await ensureCanonicalRuntime(
          tx as Prisma.TransactionClient,
          created.id,
          scope.classroomId,
          gameKind,
        );
      }
      return created;
    };
    const room =
      needsCanonicalRuntime(gameKind)
        ? await db.$transaction((tx) => createRoom(tx))
        : await createRoom(db);
    return room as CanonicalGameRoom;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await findCanonicalRoom(scope.classroomId, gameKind);
    if (raced) {
      await ensureTeacherOwnership(raced.id, teacherId);
      if (needsCanonicalRuntime(gameKind)) {
        await db.$transaction((tx) =>
          ensureCanonicalRuntime(tx, raced.id, scope.classroomId, gameKind),
        );
      }
      return raced;
    }
    throw error;
  }
}
