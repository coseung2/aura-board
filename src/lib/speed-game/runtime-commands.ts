import "server-only";

import { Prisma } from "@prisma/client";
import type { SpeedGameWire } from "@/components/speed-game/types";
import { db } from "@/lib/db";
import {
  IdempotencyConflictError,
  withPlayRequestReceipt,
} from "@/lib/game-platform/idempotency";
import { answersMatch, computeScore } from "./score";
import {
  createSpeedGameRun,
  finalizeSpeedGameRun,
  loadSpeedGameRunSnapshot,
  parseConfig,
  safeVersion,
  SpeedRunCommandError,
  type SpeedParticipantCommand,
  type SpeedRunCommand,
  writeParticipantResult,
} from "./runtime-core";

export async function commandSpeedGameRun(input: {
  gameId: string;
  runId: string;
  requestId: string;
  expectedVersion: number;
  action: SpeedRunCommand;
  actorSubject: string;
}): Promise<{
  game: SpeedGameWire;
  previousVersion: number;
  version: number;
  replayed: boolean;
}> {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new SpeedRunCommandError("invalid_version", 400);
  }
  return db.$transaction(async (tx) => {
    const receipt = await withPlayRequestReceipt(
      tx,
      {
        actorSubject: input.actorSubject,
        scopeType: "speed_game_run_command",
        scopeId: input.runId,
        requestId: input.requestId,
        requestBody: {
          gameId: input.gameId,
          expectedVersion: input.expectedVersion,
          action: input.action,
        },
      },
      async () => {
        await tx.$queryRaw`SELECT id FROM "SpeedGameRun" WHERE id = ${input.runId} FOR UPDATE`;
        const run = await tx.speedGameRun.findUnique({
          where: { id: input.runId },
          select: {
            id: true,
            gameId: true,
            status: true,
            version: true,
            current: true,
            currentRoundIndex: true,
          },
        });
        if (!run || run.gameId !== input.gameId || !run.current) {
          throw new SpeedRunCommandError("run_not_found", 404);
        }
        const previousVersion = safeVersion(run.version);
        if (previousVersion !== input.expectedVersion) {
          throw new SpeedRunCommandError(
            "version_conflict",
            409,
            await loadSpeedGameRunSnapshot(run.id, tx),
          );
        }
        const now = new Date();
        let responseRunId = run.id;
        if (input.action === "start") {
          if (run.status !== "lobby") {
            throw new SpeedRunCommandError(
              "invalid_state",
              409,
              await loadSpeedGameRunSnapshot(run.id, tx),
            );
          }
          const firstRound = await tx.speedGameRunRound.findFirst({
            where: { runId: run.id },
            orderBy: { order: "asc" },
            select: { id: true, order: true },
          });
          if (!firstRound) throw new SpeedRunCommandError("round_not_found", 409);
          await tx.speedGameRunRound.update({
            where: { id: firstRound.id },
            data: { startedAt: now },
          });
          await tx.speedGameRun.update({
            where: { id: run.id },
            data: {
              status: "running",
              currentRoundIndex: firstRound.order,
              startedAt: now,
              version: { increment: 1 },
            },
          });
        } else if (input.action === "next") {
          if (run.status !== "running") {
            throw new SpeedRunCommandError("invalid_state", 409);
          }
          const currentRound = await tx.speedGameRunRound.findFirst({
            where: { runId: run.id, order: run.currentRoundIndex },
            select: { id: true },
          });
          const nextRound = await tx.speedGameRunRound.findFirst({
            where: { runId: run.id, order: { gt: run.currentRoundIndex } },
            orderBy: { order: "asc" },
            select: { id: true, order: true },
          });
          if (!currentRound || !nextRound) {
            throw new SpeedRunCommandError(
              "already_last_round",
              409,
              await loadSpeedGameRunSnapshot(run.id, tx),
            );
          }
          await tx.speedGameRunRound.update({
            where: { id: currentRound.id },
            data: { endedAt: now },
          });
          await tx.speedGameRunRound.update({
            where: { id: nextRound.id },
            data: { startedAt: now },
          });
          await tx.speedGameRun.update({
            where: { id: run.id },
            data: {
              currentRoundIndex: nextRound.order,
              version: { increment: 1 },
            },
          });
        } else if (input.action === "finish" || input.action === "end-early") {
          if (run.status !== "running") {
            throw new SpeedRunCommandError("invalid_state", 409);
          }
          await finalizeSpeedGameRun(tx, {
            runId: run.id,
            reason: input.action === "end-early" ? "host_ended" : "completed",
            completedAt: now,
          });
        } else {
          if (!["finished", "host-ended", "abandoned"].includes(run.status)) {
            throw new SpeedRunCommandError("run_not_terminal", 409);
          }
          responseRunId = await createSpeedGameRun(tx, {
            gameId: input.gameId,
            previousRunId: run.id,
          });
        }
        const game = await loadSpeedGameRunSnapshot(responseRunId, tx);
        if (!game) throw new Error("speed_game_snapshot_missing_after_command");
        return {
          game,
          previousVersion,
          version: game.version,
        } as unknown as Prisma.InputJsonObject;
      },
    );
    const response = receipt.response as unknown as {
      game: SpeedGameWire;
      previousVersion: number;
      version: number;
    };
    return { ...response, replayed: receipt.replayed };
  });
}

export async function commandSpeedGameParticipant(input: {
  gameId: string;
  runId: string;
  requestId: string;
  expectedVersion: number;
  action: SpeedParticipantCommand;
  studentId: string;
  actorSubject: string;
}): Promise<{
  game: SpeedGameWire;
  previousVersion: number;
  version: number;
  resultId: string | null;
  replayed: boolean;
}> {
  return db.$transaction(async (tx) => {
    const receipt = await withPlayRequestReceipt(
      tx,
      {
        actorSubject: input.actorSubject,
        scopeType: "speed_game_run_command",
        scopeId: input.runId,
        requestId: input.requestId,
        requestBody: {
          gameId: input.gameId,
          expectedVersion: input.expectedVersion,
          action: input.action,
        },
      },
      async () => {
        await tx.$queryRaw`SELECT id FROM "SpeedGameRun" WHERE id = ${input.runId} FOR UPDATE`;
        const run = await tx.speedGameRun.findUnique({
          where: { id: input.runId },
          select: { gameId: true, version: true, status: true, current: true },
        });
        if (!run || run.gameId !== input.gameId || !run.current) {
          throw new SpeedRunCommandError("run_not_found", 404);
        }
        const previousVersion = safeVersion(run.version);
        if (previousVersion !== input.expectedVersion) {
          throw new SpeedRunCommandError(
            "version_conflict",
            409,
            await loadSpeedGameRunSnapshot(input.runId, tx),
          );
        }
        const participant = await tx.speedGameRunParticipant.findUnique({
          where: {
            runId_studentId: {
              runId: input.runId,
              studentId: input.studentId,
            },
          },
        });
        if (!participant) {
          throw new SpeedRunCommandError("participant_not_invited", 403);
        }
        if (participant.forfeitedAt && input.action !== "forfeit") {
          throw new SpeedRunCommandError("participant_forfeited", 409);
        }
        const now = new Date();
        let resultId: string | null = null;
        if (input.action === "join") {
          await tx.speedGameRunParticipant.update({
            where: { id: participant.id },
            data: { joinedAt: participant.joinedAt ?? now },
          });
        } else if (input.action === "ready") {
          if (run.status !== "lobby") {
            throw new SpeedRunCommandError("game_already_started", 409);
          }
          await tx.speedGameRunParticipant.update({
            where: { id: participant.id },
            data: {
              joinedAt: participant.joinedAt ?? now,
              readyAt: participant.readyAt ?? now,
            },
          });
        } else if (!participant.forfeitedAt) {
          await tx.speedGameRunParticipant.update({
            where: { id: participant.id },
            data: {
              joinedAt: participant.joinedAt ?? now,
              forfeitedAt: now,
            },
          });
          resultId = await writeParticipantResult(tx, {
            runId: input.runId,
            studentId: input.studentId,
            outcome: "forfeit",
            completedAt: now,
          });
        } else {
          const existing = await tx.gameResult.findFirst({
            where: {
              gameKind: "speed-game",
              sourceId: input.runId,
              studentId: input.studentId,
            },
            select: { id: true },
          });
          resultId = existing?.id ?? null;
        }
        const updated = await tx.speedGameRun.update({
          where: { id: input.runId },
          data: { version: { increment: 1 } },
          select: { version: true },
        });
        const game = await loadSpeedGameRunSnapshot(input.runId, tx);
        if (!game) throw new Error("speed_game_snapshot_missing_after_participant_command");
        return {
          game,
          previousVersion,
          version: safeVersion(updated.version),
          resultId,
        } as unknown as Prisma.InputJsonObject;
      },
    );
    const response = receipt.response as unknown as {
      game: SpeedGameWire;
      previousVersion: number;
      version: number;
      resultId: string | null;
    };
    return { ...response, replayed: receipt.replayed };
  });
}

export async function submitSpeedGameAnswer(input: {
  gameId: string;
  runId: string;
  requestId: string;
  expectedVersion: number;
  studentId: string;
  actorSubject: string;
  rawText: string;
  roundId?: string;
  groupId?: string;
  receivedAt: Date;
}): Promise<{
  game: SpeedGameWire;
  answerId: string;
  previousVersion: number;
  version: number;
  replayed: boolean;
}> {
  return db.$transaction(
    async (tx) => {
      const receipt = await withPlayRequestReceipt(
        tx,
        {
          actorSubject: input.actorSubject,
          scopeType: "speed_game_run_command",
          scopeId: input.runId,
          requestId: input.requestId,
          requestBody: {
            gameId: input.gameId,
            expectedVersion: input.expectedVersion,
            rawText: input.rawText,
            roundId: input.roundId ?? null,
            groupId: input.groupId ?? null,
          },
        },
        async () => {
          await tx.$queryRaw`SELECT id FROM "SpeedGameRun" WHERE id = ${input.runId} FOR UPDATE`;
          const run = await tx.speedGameRun.findUnique({
            where: { id: input.runId },
            select: {
              gameId: true,
              status: true,
              version: true,
              current: true,
              currentRoundIndex: true,
              configSnapshot: true,
            },
          });
          if (!run || run.gameId !== input.gameId || !run.current) {
            throw new SpeedRunCommandError("run_not_found", 404);
          }
          const previousVersion = safeVersion(run.version);
          if (previousVersion !== input.expectedVersion) {
            throw new SpeedRunCommandError(
              "version_conflict",
              409,
              await loadSpeedGameRunSnapshot(input.runId, tx),
            );
          }
          if (run.status !== "running") {
            throw new SpeedRunCommandError("game_not_running", 409);
          }
          const [participant, round] = await Promise.all([
            tx.speedGameRunParticipant.findUnique({
              where: {
                runId_studentId: {
                  runId: input.runId,
                  studentId: input.studentId,
                },
              },
            }),
            tx.speedGameRunRound.findFirst({
              where: { runId: input.runId, order: run.currentRoundIndex },
            }),
          ]);
          if (!participant) throw new SpeedRunCommandError("participant_not_invited", 403);
          if (participant.forfeitedAt) {
            throw new SpeedRunCommandError("participant_forfeited", 409);
          }
          if (!round || !round.startedAt || round.endedAt) {
            throw new SpeedRunCommandError("round_not_active", 409);
          }
          if (input.roundId && input.roundId !== round.id) {
            throw new SpeedRunCommandError("round_mismatch", 409);
          }
          if (input.groupId && input.groupId !== participant.groupId) {
            throw new SpeedRunCommandError("group_mismatch", 403);
          }
          if (participant.memberOrder + 1 !== round.guesserSlot) {
            throw new SpeedRunCommandError("not_current_guesser", 403);
          }
          const existing = await tx.speedGameRunAnswer.findUnique({
            where: {
              runRoundId_groupId: {
                runRoundId: round.id,
                groupId: participant.groupId,
              },
            },
            select: { id: true },
          });
          if (existing) {
            throw new SpeedRunCommandError("already_answered", 409);
          }

          const config = parseConfig(run.configSnapshot);
          const rawText = input.rawText.trim();
          if (!rawText || rawText.length > 200) {
            throw new SpeedRunCommandError("invalid_answer", 400);
          }
          const elapsedMs = Math.max(
            0,
            input.receivedAt.getTime() - round.startedAt.getTime(),
          );
          const autoJudge = config.answerMode !== "teacher-approval";
          const correct = autoJudge
            ? config.answerMode === "exact"
              ? rawText.toLocaleLowerCase("ko-KR") ===
                round.keyword.trim().toLocaleLowerCase("ko-KR")
              : answersMatch(round.keywordNormalized, rawText)
            : false;
          const approval = correct
            ? "accepted"
            : autoJudge
              ? "rejected"
              : "pending";
          let score = 0;
          if (correct) {
            const accepted = await tx.speedGameRunAnswer.findMany({
              where: {
                runRoundId: round.id,
                correct: true,
                approval: "accepted",
              },
              select: { id: true, createdAt: true, correct: true },
            });
            score = computeScore({
              correct: true,
              elapsedMs,
              rank: accepted.length + 1,
              bonusRanks: config.bonusRanks,
              baseScore: config.baseScore,
              minScore: config.minScore,
            });
          }
          const answer = await tx.speedGameRunAnswer.create({
            data: {
              runRoundId: round.id,
              groupId: participant.groupId,
              studentId: input.studentId,
              rawText,
              correct,
              approval,
              score,
              elapsedMs,
            },
            select: { id: true },
          });
          await tx.speedGameRunParticipant.update({
            where: { id: participant.id },
            data: { joinedAt: participant.joinedAt ?? input.receivedAt },
          });
          const updated = await tx.speedGameRun.update({
            where: { id: input.runId },
            data: { version: { increment: 1 } },
            select: { version: true },
          });
          const game = await loadSpeedGameRunSnapshot(input.runId, tx);
          if (!game) throw new Error("speed_game_snapshot_missing_after_answer");
          return {
            game,
            answerId: answer.id,
            previousVersion,
            version: safeVersion(updated.version),
          } as unknown as Prisma.InputJsonObject;
        },
      );
      const response = receipt.response as unknown as {
        game: SpeedGameWire;
        answerId: string;
        previousVersion: number;
        version: number;
      };
      return { ...response, replayed: receipt.replayed };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function reviewSpeedGameAnswer(input: {
  gameId: string;
  runId: string;
  answerId: string;
  requestId: string;
  expectedVersion: number;
  decision: "accepted" | "rejected";
  actorSubject: string;
}): Promise<{
  game: SpeedGameWire;
  previousVersion: number;
  version: number;
  replayed: boolean;
}> {
  return db.$transaction(
    async (tx) => {
      const receipt = await withPlayRequestReceipt(
        tx,
        {
          actorSubject: input.actorSubject,
          scopeType: "speed_game_run_command",
          scopeId: input.runId,
          requestId: input.requestId,
          requestBody: {
            answerId: input.answerId,
            expectedVersion: input.expectedVersion,
            decision: input.decision,
          },
        },
        async () => {
          await tx.$queryRaw`SELECT id FROM "SpeedGameRun" WHERE id = ${input.runId} FOR UPDATE`;
          const run = await tx.speedGameRun.findUnique({
            where: { id: input.runId },
            select: {
              gameId: true,
              version: true,
              current: true,
              configSnapshot: true,
            },
          });
          if (!run || run.gameId !== input.gameId || !run.current) {
            throw new SpeedRunCommandError("run_not_found", 404);
          }
          const previousVersion = safeVersion(run.version);
          if (previousVersion !== input.expectedVersion) {
            throw new SpeedRunCommandError(
              "version_conflict",
              409,
              await loadSpeedGameRunSnapshot(input.runId, tx),
            );
          }
          const answer = await tx.speedGameRunAnswer.findFirst({
            where: {
              id: input.answerId,
              runRound: { runId: input.runId },
            },
            include: { runRound: true },
          });
          if (!answer) throw new SpeedRunCommandError("answer_not_found", 404);
          if (answer.approval !== "pending") {
            throw new SpeedRunCommandError("answer_already_reviewed", 409);
          }
          const config = parseConfig(run.configSnapshot);
          let score = 0;
          const correct = input.decision === "accepted";
          if (correct) {
            const accepted = await tx.speedGameRunAnswer.count({
              where: {
                runRoundId: answer.runRoundId,
                approval: "accepted",
                correct: true,
              },
            });
            score = computeScore({
              correct: true,
              elapsedMs: answer.elapsedMs,
              rank: accepted + 1,
              bonusRanks: config.bonusRanks,
              baseScore: config.baseScore,
              minScore: config.minScore,
            });
          }
          await tx.speedGameRunAnswer.update({
            where: { id: answer.id },
            data: {
              approval: input.decision,
              correct,
              score,
            },
          });
          const updated = await tx.speedGameRun.update({
            where: { id: input.runId },
            data: { version: { increment: 1 } },
            select: { version: true },
          });
          const game = await loadSpeedGameRunSnapshot(input.runId, tx);
          if (!game) throw new Error("speed_game_snapshot_missing_after_review");
          return {
            game,
            previousVersion,
            version: safeVersion(updated.version),
          } as unknown as Prisma.InputJsonObject;
        },
      );
      const response = receipt.response as unknown as {
        game: SpeedGameWire;
        previousVersion: number;
        version: number;
      };
      return { ...response, replayed: receipt.replayed };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export { IdempotencyConflictError };
