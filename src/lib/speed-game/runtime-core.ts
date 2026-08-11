import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import type { SpeedGameWire } from "@/components/speed-game/types";
import {
  IdempotencyConflictError,
  withPlayRequestReceipt,
} from "@/lib/game-platform/idempotency";
import { writeGameResult } from "@/lib/game-platform/result-writer";
import {
  answersMatch,
  computeScore,
  normalizeKeyword,
  parseBonusRanks,
  rankCorrectAnswers,
} from "./score";

const SPEED_RULES_VERSION = 1;
const SPEED_STATE_SCHEMA_VERSION = 1;

type SpeedClient = Prisma.TransactionClient | typeof db;

const ConfigSchema = z
  .object({
    answerMode: z.enum(["exact", "normalize-space", "teacher-approval"]),
    baseScore: z.number().int().min(1).max(1_000_000),
    minScore: z.number().int().min(0).max(1_000_000),
    bonusRanks: z.array(z.number().int().min(0).max(1_000_000)).max(100),
    timeLimitMs: z.number().int().min(1_000).max(3_600_000),
  })
  .strict();

type SpeedRunConfig = z.infer<typeof ConfigSchema>;

export type SpeedRunCommand = "start" | "next" | "finish" | "end-early" | "rematch";
export type SpeedParticipantCommand = "join" | "ready" | "forfeit";

export type GameRuntimeAuth =
  | {
      kind: "teacher";
      userId: string;
      role: "owner" | "editor" | "viewer";
    }
  | { kind: "student"; studentId: string; classroomId: string }
  | { kind: "unauthorized" };

export async function authenticateGameViewer(
  boardId: string,
): Promise<GameRuntimeAuth> {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    const role = await getBoardRole(boardId, user.id);
    if (role) return { kind: "teacher", userId: user.id, role };
  }
  const student = await getCurrentStudent();
  if (student) {
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true },
    });
    if (board?.classroomId === student.classroomId) {
      return {
        kind: "student",
        studentId: student.id,
        classroomId: student.classroomId,
      };
    }
  }
  return { kind: "unauthorized" };
}

export class SpeedRunCommandError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
    readonly snapshot?: SpeedGameWire | null,
  ) {
    super(code);
  }
}

export function safeVersion(value: bigint): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new RangeError("speed_game_version_out_of_range");
  }
  return version;
}

export function parseConfig(value: Prisma.JsonValue): SpeedRunConfig {
  return ConfigSchema.parse(value);
}

function gameStatus(status: string): SpeedGameWire["status"] {
  if (status === "running") return "active";
  if (status === "finished" || status === "abandoned" || status === "host-ended") {
    return "finished";
  }
  return "waiting";
}

async function loadRunRecord(client: SpeedClient, runId: string) {
  return client.speedGameRun.findUnique({
    where: { id: runId },
    include: {
      game: {
        include: {
          board: {
            select: {
              id: true,
              slug: true,
              classroomId: true,
            },
          },
        },
      },
      groups: {
        orderBy: { order: "asc" },
      },
      participants: {
        orderBy: [{ groupId: "asc" }, { memberOrder: "asc" }],
        include: { student: { select: { name: true } } },
      },
      rounds: {
        orderBy: { order: "asc" },
        include: {
          answers: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      },
    },
  });
}

function serializeRunRecord(
  run: NonNullable<Awaited<ReturnType<typeof loadRunRecord>>>,
): SpeedGameWire {
  const config = parseConfig(run.configSnapshot);
  const rankByAnswerId = new Map<string, number>();
  for (const round of run.rounds) {
    const ranked = rankCorrectAnswers(
      round.answers.map((answer) => ({
        answerId: answer.id,
        createdAt: answer.createdAt,
        correct: answer.correct && answer.approval === "accepted",
      })),
    );
    for (const [answerId, rankedAnswer] of ranked) {
      rankByAnswerId.set(answerId, rankedAnswer.rank);
    }
  }

  const groupScores = new Map(run.groups.map((group) => [group.id, 0]));
  for (const round of run.rounds) {
    for (const answer of round.answers) {
      if (answer.approval === "accepted") {
        groupScores.set(
          answer.groupId,
          (groupScores.get(answer.groupId) ?? 0) + answer.score,
        );
      }
    }
  }

  return {
    id: run.gameId,
    runId: run.id,
    version: safeVersion(run.version),
    terminalReason: run.terminalReason as SpeedGameWire["terminalReason"],
    boardId: run.boardId,
    boardSlug: run.game.board.slug ?? run.boardId,
    classroomId: run.game.board.classroomId ?? "",
    status: gameStatus(run.status),
    roundIndex: run.currentRoundIndex,
    answerMode: config.answerMode,
    baseScore: config.baseScore,
    minScore: config.minScore,
    bonusRanks: config.bonusRanks,
    timeLimitMs: config.timeLimitMs,
    rounds: run.rounds.map((round) => ({
      id: round.id,
      order: round.order,
      keyword: round.keyword,
      guesserSlot: round.guesserSlot,
      startedAt: round.startedAt?.toISOString() ?? null,
      endedAt: round.endedAt?.toISOString() ?? null,
    })),
    answers: run.rounds.flatMap((round) =>
      round.answers.map((answer) => ({
        id: answer.id,
        roundId: round.id,
        groupId: answer.groupId,
        studentId: answer.studentId,
        answer: answer.rawText,
        correct:
          answer.approval === "pending"
            ? null
            : answer.approval === "accepted" && answer.correct,
        elapsedMs: answer.elapsedMs,
        rank: rankByAnswerId.get(answer.id) ?? null,
        score: answer.approval === "pending" ? null : answer.score,
        createdAt: answer.createdAt.toISOString(),
      })),
    ),
    groups: run.groups.map((group) => ({
      id: group.id,
      name: group.name,
      studentIds: run.participants
        .filter((participant) => participant.groupId === group.id)
        .sort((left, right) => left.memberOrder - right.memberOrder)
        .map((participant) => participant.studentId),
    })),
    participants: run.participants.map((participant) => ({
      studentId: participant.studentId,
      groupId: participant.groupId,
      name: participant.student.name,
      invitedAt: participant.invitedAt.toISOString(),
      joinedAt: participant.joinedAt?.toISOString() ?? null,
      readyAt: participant.readyAt?.toISOString() ?? null,
      forfeitedAt: participant.forfeitedAt?.toISOString() ?? null,
    })),
    leaderboard: run.groups
      .map((group) => ({
        groupId: group.id,
        groupName: group.name,
        score: groupScores.get(group.id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.groupName.localeCompare(right.groupName, "ko-KR"),
      ),
  };
}

export async function createSpeedGameRun(
  tx: Prisma.TransactionClient,
  input: { gameId: string; previousRunId?: string | null },
): Promise<string> {
  await tx.$queryRaw`SELECT id FROM "SpeedGame" WHERE id = ${input.gameId} FOR UPDATE`;
  const game = await tx.speedGame.findUnique({
    where: { id: input.gameId },
    include: {
      board: {
        select: {
          id: true,
          defaultGroups: {
            orderBy: { order: "asc" },
            include: {
              members: {
                orderBy: { order: "asc" },
                select: { studentId: true, order: true },
              },
            },
          },
        },
      },
      rounds: { orderBy: { order: "asc" } },
    },
  });
  if (!game) throw new SpeedRunCommandError("game_not_found", 404);
  if (game.board.defaultGroups.length === 0 || game.rounds.length === 0) {
    throw new SpeedRunCommandError("run_snapshot_incomplete", 409);
  }

  await tx.speedGameRun.updateMany({
    where: { boardId: game.boardId, current: true },
    data: { current: false },
  });
  const run = await tx.speedGameRun.create({
    data: {
      gameId: game.id,
      boardId: game.boardId,
      previousRunId: input.previousRunId ?? null,
      configSnapshot: {
        answerMode: game.answerMode,
        baseScore: game.baseScore,
        minScore: game.minScore,
        bonusRanks: parseBonusRanks(game.bonusRanks),
        timeLimitMs: game.timeLimitMs,
      },
    },
    select: { id: true },
  });

  const groupIdBySource = new Map<string, string>();
  for (const source of game.board.defaultGroups) {
    const group = await tx.speedGameRunGroup.create({
      data: {
        runId: run.id,
        sourceGroupId: source.id,
        name: source.name,
        order: source.order,
      },
      select: { id: true },
    });
    groupIdBySource.set(source.id, group.id);
    if (source.members.length > 0) {
      await tx.speedGameRunParticipant.createMany({
        data: source.members.map((member) => ({
          runId: run.id,
          groupId: group.id,
          studentId: member.studentId,
          memberOrder: member.order,
        })),
      });
    }
  }
  await tx.speedGameRunRound.createMany({
    data: game.rounds.map((round) => ({
      runId: run.id,
      sourceRoundId: round.id,
      order: round.order,
      keyword: round.keyword,
      keywordNormalized: round.keywordNormalized,
      guesserSlot: round.guesserSlot,
    })),
  });
  return run.id;
}

export async function ensureCurrentSpeedGameRun(gameId: string): Promise<string> {
  const existing = await db.speedGameRun.findFirst({
    where: { gameId, current: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.id;
  try {
    return await db.$transaction((tx) => createSpeedGameRun(tx, { gameId }));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await db.speedGameRun.findFirst({
        where: { gameId, current: true },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (raced) return raced.id;
    }
    throw error;
  }
}

export async function loadSpeedGameRunSnapshot(
  runId: string,
  client: SpeedClient = db,
): Promise<SpeedGameWire | null> {
  const run = await loadRunRecord(client, runId);
  return run ? serializeRunRecord(run) : null;
}

export async function loadGameSnapshot(
  gameId: string,
): Promise<SpeedGameWire | null> {
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { id: true },
  });
  if (!game) return null;
  const runId = await ensureCurrentSpeedGameRun(gameId);
  return loadSpeedGameRunSnapshot(runId);
}

export async function resolveStudentGroupId(
  boardId: string,
  studentId: string,
): Promise<string | null> {
  const participant = await db.speedGameRunParticipant.findFirst({
    where: {
      studentId,
      run: { boardId, current: true },
    },
    orderBy: { createdAt: "desc" },
    select: { groupId: true },
  });
  return participant?.groupId ?? null;
}

function groupStats(snapshot: SpeedGameWire) {
  const correctByGroup = new Map<string, number>();
  for (const answer of snapshot.answers) {
    if (answer.correct === true) {
      correctByGroup.set(
        answer.groupId,
        (correctByGroup.get(answer.groupId) ?? 0) + 1,
      );
    }
  }
  const rankByGroup = new Map<string, number>();
  snapshot.leaderboard.forEach((row, index) => rankByGroup.set(row.groupId, index + 1));
  return { correctByGroup, rankByGroup };
}

export async function writeParticipantResult(
  tx: Prisma.TransactionClient,
  input: {
    runId: string;
    studentId: string;
    outcome: "completed" | "forfeit" | "host-ended";
    completedAt: Date;
  },
): Promise<string> {
  const snapshot = await loadSpeedGameRunSnapshot(input.runId, tx);
  if (!snapshot) throw new SpeedRunCommandError("run_not_found", 404);
  const participant = snapshot.participants.find(
    (candidate) => candidate.studentId === input.studentId,
  );
  if (!participant) throw new SpeedRunCommandError("participant_not_invited", 403);
  const group = snapshot.groups.find((candidate) => candidate.id === participant.groupId);
  const leaderboard = snapshot.leaderboard.find(
    (candidate) => candidate.groupId === participant.groupId,
  );
  if (!group || !leaderboard) throw new Error("speed_game_group_snapshot_missing");
  const { correctByGroup, rankByGroup } = groupStats(snapshot);
  const run = await tx.speedGameRun.findUnique({
    where: { id: input.runId },
    select: { createdAt: true, startedAt: true },
  });
  if (!run) throw new SpeedRunCommandError("run_not_found", 404);
  const result = await writeGameResult(tx, {
    gameKind: "speed-game",
    boardId: snapshot.boardId,
    classroomId: snapshot.classroomId,
    studentId: input.studentId,
    sourceType: "speed_game_run",
    sourceId: input.runId,
    outcome: input.outcome,
    score: leaderboard.score,
    metrics: {
      attribution: "team",
      groupName: group.name,
      groupRank: rankByGroup.get(group.id) ?? snapshot.leaderboard.length,
      correctCount: correctByGroup.get(group.id) ?? 0,
      totalRounds: snapshot.rounds.length,
    },
    startedAt: run.startedAt ?? run.createdAt,
    completedAt: input.completedAt,
    rulesVersion: SPEED_RULES_VERSION,
    stateSchemaVersion: SPEED_STATE_SCHEMA_VERSION,
  });
  return result.id;
}

export async function finalizeSpeedGameRun(
  tx: Prisma.TransactionClient,
  input: {
    runId: string;
    reason: "completed" | "host_ended";
    completedAt: Date;
  },
): Promise<{ version: number; resultIds: string[] }> {
  await tx.$queryRaw`SELECT id FROM "SpeedGameRun" WHERE id = ${input.runId} FOR UPDATE`;
  const current = await tx.speedGameRun.findUnique({
    where: { id: input.runId },
    include: { participants: true },
  });
  if (!current) throw new SpeedRunCommandError("run_not_found", 404);
  const terminalStatus = input.reason === "host_ended" ? "host-ended" : "finished";
  const run =
    current.completedAt == null
      ? await tx.speedGameRun.update({
          where: { id: current.id },
          data: {
            status: terminalStatus,
            terminalReason: input.reason,
            completedAt: input.completedAt,
            version: { increment: 1 },
          },
        })
      : current;
  await tx.speedGameRunRound.updateMany({
    where: { runId: current.id, endedAt: null, startedAt: { not: null } },
    data: { endedAt: run.completedAt ?? input.completedAt },
  });

  const resultIds: string[] = [];
  for (const participant of current.participants) {
    if (!participant.joinedAt) continue;
    const outcome = participant.forfeitedAt
      ? "forfeit"
      : input.reason === "host_ended"
        ? "host-ended"
        : "completed";
    resultIds.push(
      await writeParticipantResult(tx, {
        runId: current.id,
        studentId: participant.studentId,
        outcome,
        completedAt:
          participant.forfeitedAt ?? run.completedAt ?? input.completedAt,
      }),
    );
  }
  return { version: safeVersion(run.version), resultIds };
}
