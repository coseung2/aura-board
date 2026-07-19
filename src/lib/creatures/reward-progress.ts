import "server-only";

import { Prisma } from "@prisma/client";

import { CREATURE_RULES_VERSION, CREATURE_STAGES, type CreatureStage } from "./catalog";
import { resolveProgressTransition } from "./service";

/**
 * Reward sources that are allowed to grant creature progress in v1.
 *
 * This is intentionally an internal allow-list. Reward routes must first
 * verify their activity and compute the wallet amount; no client-facing route
 * should call this helper with arbitrary source names or deltas.
 */
export const VERIFIED_REWARD_SOURCE_TYPES = [
  "reading_reward",
  "walking_reward",
  "walking_weekly_reward",
  "assignment_reward",
  "comment_reward",
] as const;

export type VerifiedRewardSourceType = (typeof VERIFIED_REWARD_SOURCE_TYPES)[number];

/** v1 awards one non-spendable growth point per verified reward source. */
export const CREATURE_REWARD_PROGRESS_DELTA = 1 as const;

export type ApplyVerifiedRewardProgressInput = {
  /** The authenticated student for whom the upstream reward was verified. */
  studentId: string;
  /** The authenticated student's classroom; never supplied by a client body. */
  classroomId: string;
  /** A bounded, server-owned reward source namespace. */
  sourceType: VerifiedRewardSourceType;
  /** Immutable server ID for the verified activity (for example readingLogId). */
  sourceRef: string;
  /** The amount computed by the upstream reward verifier, persisted for audit. */
  currencyAmount: number;
};

type EventLike = {
  id: string;
  studentCreatureId: string;
  studentId: string;
  classroomId: string;
  sourceType: string;
  sourceRef: string;
  idempotencyKey: string;
  rulesVersion: string;
  currencyAmount: number;
  progressDelta: number;
  progressBefore: number;
  progressAfter: number;
  stageBefore: string;
  stageAfter: string;
  appliedAt: Date;
  reversedAt: Date | null;
};

type CreatureLike = {
  id: string;
  stage: string;
  isActive: boolean;
  progressPoints: number;
};

export type CreatureRewardProgressResult = {
  /** The single source event, or null when no active creature existed. */
  event: EventLike | null;
  /** The creature after applying the event, or null when no event was made. */
  creature: CreatureLike | null;
  /** True only when the source event already existed. */
  idempotent: boolean;
  /** Convenience fields for reward callers and future walking/assignment hooks. */
  progressEventId: string | null;
  progressDelta: number;
  stageBefore: string | null;
  stageAfter: string | null;
};

function isVerifiedRewardSourceType(value: string): value is VerifiedRewardSourceType {
  return (VERIFIED_REWARD_SOURCE_TYPES as readonly string[]).includes(value);
}

function assertInput(input: ApplyVerifiedRewardProgressInput): void {
  if (!input.studentId || !input.classroomId) {
    throw new Error("Verified reward identity is required");
  }
  if (!isVerifiedRewardSourceType(input.sourceType)) {
    throw new Error("Unsupported verified reward source");
  }
  if (typeof input.sourceRef !== "string" || input.sourceRef.trim().length === 0 || input.sourceRef.length > 300) {
    throw new Error("Verified reward source reference is required");
  }
  if (!Number.isSafeInteger(input.currencyAmount) || input.currencyAmount <= 0) {
    throw new Error("Verified reward amount must be a positive integer");
  }
}

/**
 * Stable source-scoped idempotency key for the creature ledger.
 *
 * `sourceType` is deliberately included even though the Prisma compound
 * unique key already contains it. The key is globally unique and prevents a
 * reading source from colliding with a future walking/assignment source that
 * happens to use the same source reference.
 */
export function creatureRewardIdempotencyKey(
  studentId: string,
  sourceType: VerifiedRewardSourceType,
  sourceRef: string,
  rulesVersion = CREATURE_RULES_VERSION,
): string {
  return `${studentId}:${sourceType}:${sourceRef}:${rulesVersion}`;
}

function resultFromEvent(
  event: EventLike,
  creature: CreatureLike | null,
  idempotent: boolean,
): CreatureRewardProgressResult {
  return {
    event,
    creature,
    idempotent,
    progressEventId: event.id,
    progressDelta: event.progressDelta,
    stageBefore: event.stageBefore,
    stageAfter: event.stageAfter,
  };
}

function noProgressResult(): CreatureRewardProgressResult {
  return {
    event: null,
    creature: null,
    idempotent: false,
    progressEventId: null,
    progressDelta: 0,
    stageBefore: null,
    stageAfter: null,
  };
}

/**
 * Apply one already-verified reward to the student's active creature.
 *
 * Call this inside the same Prisma transaction that creates the source
 * wallet deposit. The helper never touches StudentAccount and computes the
 * one-point delta and stage entirely from server-side constants plus the
 * current creature row. An existing source event is replayed; with no active
 * creature the call is a durable no-op (the upstream source deposit remains
 * the replay gate, so a later retry cannot grow a newly purchased egg).
 */
export async function applyVerifiedRewardProgress(
  tx: Prisma.TransactionClient,
  input: ApplyVerifiedRewardProgressInput,
): Promise<CreatureRewardProgressResult> {
  assertInput(input);

  const idempotencyKey = creatureRewardIdempotencyKey(
    input.studentId,
    input.sourceType,
    input.sourceRef,
  );

  // Replay lookup comes first so an evolved/closed creature can still return
  // the original event without attempting another transition.
  const existing = await tx.creatureProgressEvent.findFirst({
    where: {
      studentId: input.studentId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
    },
    include: { creature: true },
  });
  if (existing) {
    return resultFromEvent(existing as EventLike, (existing as { creature?: CreatureLike | null }).creature ?? null, true);
  }

  // `isActive` is the authoritative slot flag. The stage guard keeps a
  // malformed active evolved row from receiving another event.
  const creature = await tx.studentCreature.findFirst({
    where: {
      studentId: input.studentId,
      classroomId: input.classroomId,
      isActive: true,
      stage: { not: "evolved" },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!creature) return noProgressResult();

  if (!CREATURE_STAGES.includes(creature.stage as CreatureStage)) {
    throw new Error("Unknown creature stage");
  }

  const now = new Date();
  const transition = resolveProgressTransition({
    stage: creature.stage as CreatureStage,
    progressPoints: creature.progressPoints,
    progressDelta: CREATURE_REWARD_PROGRESS_DELTA,
    now,
  });

  const existingFeatured = transition.hatchedAt
    ? await tx.studentCreature.findFirst({
        where: { studentId: input.studentId, isFeatured: true },
        select: { id: true },
      })
    : null;

  const updatedCreature = await tx.studentCreature.update({
    where: { id: creature.id },
    data: {
      progressPoints: transition.progressAfter,
      stage: transition.stageAfter,
      // `resolveProgressTransition` closes the active slot exactly when the
      // monotonic path reaches evolved.
      isActive: transition.isActive,
      ...(transition.hatchedAt && !existingFeatured ? { isFeatured: true } : {}),
      ...(transition.hatchedAt ? { hatchedAt: transition.hatchedAt } : {}),
      ...(transition.juvenileAt ? { juvenileAt: transition.juvenileAt } : {}),
      ...(transition.evolvedAt ? { evolvedAt: transition.evolvedAt } : {}),
      ...(transition.completedAt ? { completedAt: transition.completedAt } : {}),
    },
  });

  const event = await tx.creatureProgressEvent.create({
    data: {
      studentCreatureId: creature.id,
      studentId: input.studentId,
      classroomId: input.classroomId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      idempotencyKey,
      rulesVersion: CREATURE_RULES_VERSION,
      currencyAmount: input.currencyAmount,
      progressDelta: CREATURE_REWARD_PROGRESS_DELTA,
      progressBefore: transition.progressBefore,
      progressAfter: transition.progressAfter,
      stageBefore: transition.stageBefore,
      stageAfter: transition.stageAfter,
      appliedAt: now,
    } satisfies Prisma.CreatureProgressEventUncheckedCreateInput,
  });

  return resultFromEvent(event as EventLike, updatedCreature as CreatureLike, false);
}
