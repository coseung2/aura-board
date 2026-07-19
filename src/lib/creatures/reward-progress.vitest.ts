import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { CREATURE_RULES_VERSION } from "./catalog";
import {
  applyVerifiedRewardProgress,
  creatureRewardIdempotencyKey,
  type ApplyVerifiedRewardProgressInput,
} from "./reward-progress";

type CreatureState = {
  id: string;
  studentId: string;
  classroomId: string;
  stage: string;
  isActive: boolean;
  isFeatured: boolean;
  progressPoints: number;
  createdAt: Date;
  hatchedAt: Date | null;
  juvenileAt: Date | null;
  evolvedAt: Date | null;
  completedAt: Date | null;
};

type EventState = {
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

function creature(overrides: Partial<CreatureState> = {}): CreatureState {
  return {
    id: "creature-1",
    studentId: "student-1",
    classroomId: "classroom-1",
    stage: "egg",
    isActive: true,
    isFeatured: false,
    progressPoints: 0,
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    hatchedAt: null,
    juvenileAt: null,
    evolvedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<ApplyVerifiedRewardProgressInput> = {}): ApplyVerifiedRewardProgressInput {
  return {
    studentId: "student-1",
    classroomId: "classroom-1",
    sourceType: "reading_reward",
    sourceRef: "reading-log-1",
    currencyAmount: 50,
    ...overrides,
  };
}

function fakeTx(initialCreature: CreatureState | null, hasExistingFeatured = false) {
  let currentCreature = initialCreature;
  const events: EventState[] = [];
  let eventNumber = 0;

  const tx = {
    studentCreature: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.isFeatured === true && hasExistingFeatured) {
          return { id: "existing-featured" };
        }
        if (!currentCreature) return null;
        if (where.studentId !== currentCreature.studentId || where.classroomId !== currentCreature.classroomId) return null;
        if (where.isActive === true && !currentCreature.isActive) return null;
        if (where.isFeatured === true && !currentCreature.isFeatured) return null;
        const stageFilter = where.stage as { not?: string } | undefined;
        if (stageFilter?.not && currentCreature.stage === stageFilter.not) return null;
        return currentCreature;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<CreatureState> }) => {
        if (!currentCreature || currentCreature.id !== where.id) {
          throw new Error("creature disappeared");
        }
        currentCreature = { ...currentCreature, ...data };
        return currentCreature;
      }),
    },
    creatureProgressEvent: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, string> }) => {
        const event = events.find(
          (candidate) =>
            candidate.studentId === where.studentId &&
            candidate.sourceType === where.sourceType &&
            candidate.sourceRef === where.sourceRef,
        );
        if (!event) return null;
        return { ...event, creature: currentCreature };
      }),
      create: vi.fn(async ({ data }: { data: Omit<EventState, "id" | "reversedAt"> }) => {
        const event: EventState = {
          ...data,
          id: `progress-event-${++eventNumber}`,
          reversedAt: null,
        };
        events.push(event);
        return event;
      }),
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    events,
    get creature() {
      return currentCreature;
    },
  };
}

describe("verified reward creature progress", () => {
  it("replays one source without a second event or point", async () => {
    const state = fakeTx(creature({ progressPoints: 2 }));

    const first = await applyVerifiedRewardProgress(state.tx, input());
    const replay = await applyVerifiedRewardProgress(state.tx, input());

    expect(first.idempotent).toBe(false);
    expect(first.progressDelta).toBe(1);
    expect(first.stageAfter).toBe("hatchling");
    expect(replay.idempotent).toBe(true);
    expect(replay.progressEventId).toBe(first.progressEventId);
    expect(state.events).toHaveLength(1);
    expect(state.creature).toMatchObject({ progressPoints: 3, stage: "hatchling", isActive: true, isFeatured: true });
  });

  it("does not create progress when the reward arrives without an active creature", async () => {
    const state = fakeTx(creature({ stage: "evolved", isActive: false, progressPoints: 15 }));

    const result = await applyVerifiedRewardProgress(state.tx, input());

    expect(result.progressEventId).toBeNull();
    expect(result.progressDelta).toBe(0);
    expect(state.events).toHaveLength(0);
    expect(state.creature).toMatchObject({ stage: "evolved", progressPoints: 15, isActive: false });
  });

  it("does not replace an existing representative on first hatch", async () => {
    const state = fakeTx(creature({ progressPoints: 2 }), true);

    await applyVerifiedRewardProgress(state.tx, input({ sourceRef: "reading-log-existing-feature" }));

    expect(state.creature).toMatchObject({
      stage: "hatchling",
      isActive: true,
      isFeatured: false,
    });
  });

  it("uses cumulative thresholds and closes the active slot at evolved", async () => {
    const state = fakeTx(creature({ stage: "juvenile", progressPoints: 14, isFeatured: true }));

    const result = await applyVerifiedRewardProgress(state.tx, input({ sourceRef: "reading-log-final" }));

    expect(result.event).toMatchObject({
      progressBefore: 14,
      progressAfter: 15,
      stageBefore: "juvenile",
      stageAfter: "evolved",
      progressDelta: 1,
      rulesVersion: CREATURE_RULES_VERSION,
      currencyAmount: 50,
    });
    expect(state.creature).toMatchObject({ stage: "evolved", progressPoints: 15, isActive: false, isFeatured: true });
    expect(state.creature?.completedAt).toBeInstanceOf(Date);
  });

  it("namespaces the same source reference by reward source and rules version", () => {
    expect(creatureRewardIdempotencyKey("student-1", "reading_reward", "same-id")).not.toBe(
      creatureRewardIdempotencyKey("student-1", "walking_reward", "same-id"),
    );
    expect(creatureRewardIdempotencyKey("student-1", "reading_reward", "same-id")).toContain(
      CREATURE_RULES_VERSION,
    );
    expect(creatureRewardIdempotencyKey("student-1", "walking_reward", "same-id")).not.toBe(
      creatureRewardIdempotencyKey("student-1", "walking_weekly_reward", "same-id"),
    );
  });
});
