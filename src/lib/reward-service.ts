import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "./db";
import { awardActivityReward, type ActivityRewardResult } from "./creatures/activity-rewards";
import { calculateCatalogSlimeEffects } from "./pets/math";
import { getTitleDefinition } from "./title-catalog";
import {
  DEFAULT_REWARD_POLICY,
  getKstRewardBounds,
  REWARD_EFFECT_BY_AREA,
  REWARD_SOURCE_TYPES,
  rewardAmountWithBuff,
  READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
  READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
  WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
  type RewardArea,
  type RewardPolicy,
} from "./reward-policy";

export type PolicyRewardResult = ActivityRewardResult & {
  baseAmount: number;
  buffBps: number;
};

/**
 * Serialize reward decisions for one wallet before reading idempotency and cap
 * state. A row lock avoids PostgreSQL Serializable predicate conflicts between
 * unrelated students while preserving exact balance/cap behavior for two
 * concurrent actions from the same student.
 */
export async function lockRewardAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<void> {
  if (!accountId) throw new Error("Reward account is required");
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "StudentAccount" WHERE "id" = ${accountId} FOR UPDATE`,
  );
  if (rows.length !== 1) throw new Error("Reward account not found");
}

function positiveOrDefault(value: number | null | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

type RewardPolicyReader = Pick<Prisma.TransactionClient, "avatarRewardConfig">;

export async function loadRewardPolicy(
  tx: RewardPolicyReader,
  classroomId: string,
): Promise<RewardPolicy> {
  const row = await tx.avatarRewardConfig.findUnique({ where: { classroomId } });
  const policy = {} as RewardPolicy;
  for (const key of Object.keys(DEFAULT_REWARD_POLICY) as Array<keyof RewardPolicy>) {
    policy[key] = positiveOrDefault(row?.[key], DEFAULT_REWARD_POLICY[key]);
  }
  // Product guardrails are hard limits even if an older/admin row contains
  // larger values. Amounts and score thresholds remain classroom-configurable.
  policy.readingDailyRewardCap = Math.min(policy.readingDailyRewardCap, 10);
  policy.readingWeeklyRewardCap = Math.min(policy.readingWeeklyRewardCap, 20);
  policy.commentDailyRewardCap = Math.min(policy.commentDailyRewardCap, 10);
  policy.commentWeeklyRewardCap = Math.min(policy.commentWeeklyRewardCap, 30);
  // Assignment caps use zero as the explicit unlimited value. Positive
  // classroom overrides remain supported for deployments that still want a
  // local throttle; the product default is unlimited per valid submission.
  policy.walkingDailyUnitCap = Math.min(policy.walkingDailyUnitCap, 4);
  policy.walkingWeeklyRewardDayCap = Math.min(policy.walkingWeeklyRewardDayCap, 5);
  // Reward buffs are uncapped. Existing rows still carry the retired 20% value,
  // so the stored ceiling is ignored rather than migrated.
  policy.rewardBuffCapBps = Number.MAX_SAFE_INTEGER;
  return policy;
}

const REWARD_POLICY_CACHE_TTL_MS = 60_000;
type RewardPolicyCacheEntry = {
  value: RewardPolicy | null;
  expiresAt: number;
  pending: Promise<RewardPolicy> | null;
};
const rewardPolicyCache = new Map<string, RewardPolicyCacheEntry>();

/** Classroom reward settings change rarely; dedupe simultaneous lesson reads. */
export async function loadRewardPolicyCached(
  classroomId: string,
): Promise<RewardPolicy> {
  const now = Date.now();
  const cached = rewardPolicyCache.get(classroomId);
  if (cached?.value && cached.expiresAt > now) return { ...cached.value };
  if (cached?.pending) return { ...(await cached.pending) };

  const pending = loadRewardPolicy(db, classroomId)
    .then((policy) => {
      rewardPolicyCache.set(classroomId, {
        value: policy,
        expiresAt: Date.now() + REWARD_POLICY_CACHE_TTL_MS,
        pending: null,
      });
      return policy;
    })
    .catch((error) => {
      rewardPolicyCache.delete(classroomId);
      throw error;
    });
  rewardPolicyCache.set(classroomId, {
    value: null,
    expiresAt: 0,
    pending,
  });
  return { ...(await pending) };
}

export function invalidateRewardPolicyCache(classroomId?: string): void {
  if (classroomId) rewardPolicyCache.delete(classroomId);
  else rewardPolicyCache.clear();
}

type RawRewardContextRow = {
  slimes: unknown;
  item_keys: unknown;
  has_active_creature: boolean;
};

export type PreparedRewardContext = {
  buffBps: number;
  hasActiveCreature: boolean;
};

function parseRewardContext(
  row: RawRewardContextRow | undefined,
  area: RewardArea,
  capBps: number,
): PreparedRewardContext {
  const rawSlimes = Array.isArray(row?.slimes) ? row.slimes : [];
  const equippedSlimes = rawSlimes.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const slime = value as Record<string, unknown>;
    if (typeof slime.color !== "string") return [];
    return [{
      color: slime.color,
      growthStage: Number.isSafeInteger(slime.growthStage)
        ? Number(slime.growthStage)
        : 1,
      equippedTitleKey:
        typeof slime.equippedTitleKey === "string"
          ? slime.equippedTitleKey
          : null,
    }];
  });
  const equippedItemKeys = Array.isArray(row?.item_keys)
    ? row.item_keys.filter((value): value is string => typeof value === "string")
    : [];
  const effects = calculateCatalogSlimeEffects(
    equippedSlimes.map((slime) => slime.color),
    equippedItemKeys,
    capBps,
    Object.fromEntries(
      equippedSlimes.map((slime) => [slime.color, slime.growthStage]),
    ),
  );
  const effectKey = REWARD_EFFECT_BY_AREA[area];
  const titleBps = equippedSlimes.reduce((sum, slime) => {
    if (!slime.equippedTitleKey) return sum;
    const definition = getTitleDefinition(slime.equippedTitleKey);
    return definition?.effectKey === effectKey ? sum + definition.buffBps : sum;
  }, 0);
  const total = effects.totals[effectKey] + titleBps;
  const boundedCap = Math.max(
    0,
    Math.trunc(Number.isFinite(capBps) ? capBps : 0),
  );
  return {
    buffBps: Math.min(total, boundedCap),
    hasActiveCreature: row?.has_active_creature === true,
  };
}

export async function loadEquippedRewardContext(
  tx: Prisma.TransactionClient,
  studentId: string,
  area: RewardArea,
  capBps: number,
): Promise<PreparedRewardContext> {
  const rows = await tx.$queryRaw<Array<RawRewardContextRow>>(Prisma.sql`
    SELECT
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'color', slime."color",
              'growthStage', slime."growthStage",
              'equippedTitleKey', slime."equippedTitleKey"
            )
          )
          FROM "StudentSlime" AS slime
          WHERE slime."studentId" = ${studentId}
            AND slime."isEquipped" = true
        ),
        '[]'::jsonb
      ) AS "slimes",
      COALESCE(
        (
          SELECT jsonb_agg(item."itemKey")
          FROM "StudentCreatureItem" AS item
          WHERE item."studentId" = ${studentId}
            AND item."isEquipped" = true
            AND item."quantity" > 0
        ),
        '[]'::jsonb
      ) AS "item_keys",
      EXISTS(
        SELECT 1
        FROM "StudentCreature" AS creature
        WHERE creature."studentId" = ${studentId}
          AND creature."isActive" = true
      ) AS "has_active_creature"
  `);
  return parseRewardContext(rows[0], area, capBps);
}

export async function loadEquippedRewardBuffBps(
  tx: Prisma.TransactionClient,
  studentId: string,
  area: RewardArea,
  capBps: number,
): Promise<number> {
  return (await loadEquippedRewardContext(tx, studentId, area, capBps)).buffBps;
}

function capsForArea(area: Exclude<RewardArea, "walking">, policy: RewardPolicy) {
  switch (area) {
    case "reading":
      return { daily: policy.readingDailyRewardCap, weekly: policy.readingWeeklyRewardCap };
    case "comment":
      return { daily: policy.commentDailyRewardCap, weekly: policy.commentWeeklyRewardCap };
    case "assignment":
      return { daily: policy.assignmentDailyRewardCap, weekly: policy.assignmentWeeklyRewardCap };
  }
}

export type PreparedPolicyRewardCounts = {
  daily: number;
  weekly: number;
};

async function loadPolicyRewardCounts(
  tx: Prisma.TransactionClient,
  input: {
    accountId: string;
    sourceType: string;
    dayStart: Date;
    dayEnd: Date;
    weekStart: Date;
    weekEnd: Date;
  },
): Promise<PreparedPolicyRewardCounts> {
  const rows = await tx.$queryRaw<
    Array<{ daily_count: number | bigint; weekly_count: number | bigint }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE "createdAt" >= ${input.dayStart}
          AND "createdAt" < ${input.dayEnd}
      )::int AS "daily_count",
      COUNT(*)::int AS "weekly_count"
    FROM "Transaction"
    WHERE "accountId" = ${input.accountId}
      AND "sourceType" = ${input.sourceType}
      AND "type" = 'deposit'
      AND "createdAt" >= ${input.weekStart}
      AND "createdAt" < ${input.weekEnd}
  `);
  return {
    daily: Number(rows[0]?.daily_count ?? 0),
    weekly: Number(rows[0]?.weekly_count ?? 0),
  };
}

export type PreparedCommentRewardContext = {
  duplicate: boolean;
  counts: PreparedPolicyRewardCounts;
  rewardContext: PreparedRewardContext;
};

/**
 * Lock one student's wallet and collect every read-only comment reward gate in
 * a single PostgreSQL round trip. This replaces four sequential queries during
 * a synchronized classroom response wave.
 */
export async function loadPreparedCommentRewardContext(
  tx: Prisma.TransactionClient,
  input: {
    accountId: string;
    studentId: string;
    classroomId: string;
    normalizedContent: string;
    policy: RewardPolicy;
    now?: Date;
    currentComment?: { id: string; createdAt: Date };
    duplicateAlreadyClaimed?: boolean;
  },
): Promise<PreparedCommentRewardContext> {
  const bounds = getKstRewardBounds(input.now);
  const sourceType = REWARD_SOURCE_TYPES.comment;
  const rows = await tx.$queryRaw<
    Array<
      RawRewardContextRow & {
        account_found: boolean;
        duplicate: boolean;
        daily_count: number | bigint;
        weekly_count: number | bigint;
      }
    >
  >(Prisma.sql`
    WITH locked_account AS MATERIALIZED (
      SELECT "id"
      FROM "StudentAccount"
      WHERE "id" = ${input.accountId}
        AND "studentId" = ${input.studentId}
        AND "classroomId" = ${input.classroomId}
      FOR UPDATE
    )
    SELECT
      EXISTS(SELECT 1 FROM locked_account) AS "account_found",
      ${input.duplicateAlreadyClaimed
        ? Prisma.sql`FALSE`
        : Prisma.sql`EXISTS(
            SELECT 1
            FROM "CardComment"
            WHERE "authorStudentId" = ${input.studentId}
              AND regexp_replace(
                btrim(normalize("content", NFKC)),
                '[[:space:]]+',
                ' ',
                'g'
              ) = ${input.normalizedContent}
              AND (
                ${input.currentComment?.id ?? null}::text IS NULL
                OR "createdAt" < ${input.currentComment?.createdAt ?? null}
                OR (
                  "createdAt" = ${input.currentComment?.createdAt ?? null}
                  AND "id" < ${input.currentComment?.id ?? null}
                )
              )
          )`} AS "duplicate",
      (
        SELECT COUNT(*)::int
        FROM "Transaction"
        WHERE "accountId" = ${input.accountId}
          AND "sourceType" = ${sourceType}
          AND "type" = 'deposit'
          AND "createdAt" >= ${bounds.dayStart}
          AND "createdAt" < ${bounds.dayEnd}
      ) AS "daily_count",
      (
        SELECT COUNT(*)::int
        FROM "Transaction"
        WHERE "accountId" = ${input.accountId}
          AND "sourceType" = ${sourceType}
          AND "type" = 'deposit'
          AND "createdAt" >= ${bounds.weekStart}
          AND "createdAt" < ${bounds.weekEnd}
      ) AS "weekly_count",
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'color', slime."color",
              'growthStage', slime."growthStage",
              'equippedTitleKey', slime."equippedTitleKey"
            )
          )
          FROM "StudentSlime" AS slime
          WHERE slime."studentId" = ${input.studentId}
            AND slime."isEquipped" = true
        ),
        '[]'::jsonb
      ) AS "slimes",
      COALESCE(
        (
          SELECT jsonb_agg(item."itemKey")
          FROM "StudentCreatureItem" AS item
          WHERE item."studentId" = ${input.studentId}
            AND item."isEquipped" = true
            AND item."quantity" > 0
        ),
        '[]'::jsonb
      ) AS "item_keys",
      EXISTS(
        SELECT 1
        FROM "StudentCreature" AS creature
        WHERE creature."studentId" = ${input.studentId}
          AND creature."isActive" = true
      ) AS "has_active_creature"
  `);
  const row = rows[0];
  if (!row?.account_found) throw new Error("Reward account not found");
  return {
    duplicate: row.duplicate === true,
    counts: {
      daily: Number(row.daily_count ?? 0),
      weekly: Number(row.weekly_count ?? 0),
    },
    rewardContext: parseRewardContext(
      row,
      "comment",
      input.policy.rewardBuffCapBps,
    ),
  };
}

export async function awardCappedPolicyReward(input: {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  area: Exclude<RewardArea, "walking">;
  sourceRef: string;
  baseAmount: number;
  note: string;
  now?: Date;
  occurredAt?: Date;
  policy?: RewardPolicy;
  accountAlreadyVerified?: boolean;
  sourceAlreadyChecked?: boolean;
  preparedCounts?: PreparedPolicyRewardCounts;
  preparedRewardContext?: PreparedRewardContext;
}): Promise<PolicyRewardResult | null> {
  const sourceType = REWARD_SOURCE_TYPES[input.area];
  const existing = input.sourceAlreadyChecked
    ? null
    : await input.tx.transaction.findFirst({
        where: { sourceType, sourceRef: input.sourceRef, type: "deposit" },
        select: { id: true, accountId: true, amount: true },
      });
  if (existing) {
    const replay = await awardActivityReward({
      tx: input.tx,
      studentId: input.studentId,
      classroomId: input.classroomId,
      accountId: input.accountId,
      sourceType,
      sourceRef: input.sourceRef,
      amount: existing.amount,
      note: input.note,
    });
    return { ...replay, baseAmount: input.baseAmount, buffBps: 0 };
  }

  const policy = input.policy ?? await loadRewardPolicy(input.tx, input.classroomId);
  const caps = capsForArea(input.area, policy);
  if (input.baseAmount <= 0) return null;
  // Reading/comment zero values are a disable switch. Assignment zero means
  // unlimited, so only positive configured dimensions participate in the
  // count gate below.
  if (input.area !== "assignment" && (caps.daily <= 0 || caps.weekly <= 0)) return null;
  const bounds = getKstRewardBounds(input.occurredAt ?? input.now);
  const counts = input.preparedCounts ?? await loadPolicyRewardCounts(input.tx, {
    accountId: input.accountId,
    sourceType,
    dayStart: bounds.dayStart,
    dayEnd: bounds.dayEnd,
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
  });
  if ((caps.daily > 0 && counts.daily >= caps.daily) ||
      (caps.weekly > 0 && counts.weekly >= caps.weekly)) return null;

  const rewardContext = input.preparedRewardContext ?? await loadEquippedRewardContext(
    input.tx,
    input.studentId,
    input.area,
    policy.rewardBuffCapBps,
  );
  const buffBps = rewardContext.buffBps;
  const amount = rewardAmountWithBuff(input.baseAmount, buffBps, policy.rewardBuffCapBps);
  const result = await awardActivityReward({
    tx: input.tx,
    studentId: input.studentId,
    classroomId: input.classroomId,
    accountId: input.accountId,
    sourceType,
    sourceRef: input.sourceRef,
    amount,
    note: input.note,
    accountAlreadyVerified: input.accountAlreadyVerified,
    sourceAlreadyChecked: true,
    skipCreatureProgress: !rewardContext.hasActiveCreature,
    occurredAt: input.occurredAt,
  });
  return { ...result, baseAmount: input.baseAmount, buffBps };
}

export async function awardWalkingPolicyReward(input: {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  sourceRef: string;
  baseAmount: number;
  note: string;
  policy: RewardPolicy;
  sourceType?:
    | typeof REWARD_SOURCE_TYPES.walking
    | typeof WALKING_WEEKLY_REWARD_SOURCE_TYPE
    | typeof WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE;
}): Promise<PolicyRewardResult | null> {
  const sourceType = input.sourceType ?? REWARD_SOURCE_TYPES.walking;
  const existing = await input.tx.transaction.findFirst({
    where: {
      sourceType,
      sourceRef: input.sourceRef,
      type: "deposit",
    },
    select: { amount: true },
  });
  if (input.baseAmount <= 0 && !existing) return null;
  if (existing) {
    const replay = await awardActivityReward({
      tx: input.tx,
      studentId: input.studentId,
      classroomId: input.classroomId,
      accountId: input.accountId,
      sourceType,
      sourceRef: input.sourceRef,
      amount: existing.amount,
      note: input.note,
    });
    return { ...replay, baseAmount: input.baseAmount, buffBps: 0 };
  }
  const buffBps = await loadEquippedRewardBuffBps(
    input.tx,
    input.studentId,
    "walking",
    input.policy.rewardBuffCapBps,
  );
  const amount = rewardAmountWithBuff(
    input.baseAmount,
    buffBps,
    input.policy.rewardBuffCapBps,
  );
  const result = await awardActivityReward({
    tx: input.tx,
    studentId: input.studentId,
    classroomId: input.classroomId,
    accountId: input.accountId,
    sourceType,
    sourceRef: input.sourceRef,
    amount,
    note: input.note,
  });
  return { ...result, baseAmount: input.baseAmount, buffBps };
}

export async function awardReadingPolicyReward(input: {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  sourceRef: string;
  baseAmount: number;
  note: string;
  policy: RewardPolicy;
  sourceType:
    | typeof READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE
    | typeof READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE;
}): Promise<PolicyRewardResult | null> {
  const sourceType = input.sourceType;
  const existing = await input.tx.transaction.findFirst({
    where: {
      sourceType,
      sourceRef: input.sourceRef,
      type: "deposit",
    },
    select: { amount: true },
  });
  if (input.baseAmount <= 0 && !existing) return null;
  if (existing) {
    const replay = await awardActivityReward({
      tx: input.tx,
      studentId: input.studentId,
      classroomId: input.classroomId,
      accountId: input.accountId,
      sourceType,
      sourceRef: input.sourceRef,
      amount: existing.amount,
      note: input.note,
    });
    return { ...replay, baseAmount: input.baseAmount, buffBps: 0 };
  }
  const buffBps = await loadEquippedRewardBuffBps(
    input.tx,
    input.studentId,
    "reading",
    input.policy.rewardBuffCapBps,
  );
  const amount = rewardAmountWithBuff(
    input.baseAmount,
    buffBps,
    input.policy.rewardBuffCapBps,
  );
  const result = await awardActivityReward({
    tx: input.tx,
    studentId: input.studentId,
    classroomId: input.classroomId,
    accountId: input.accountId,
    sourceType,
    sourceRef: input.sourceRef,
    amount,
    note: input.note,
  });
  return { ...result, baseAmount: input.baseAmount, buffBps };
}


export async function awardReadingWeeklyMissionReward(
  input: Omit<Parameters<typeof awardReadingPolicyReward>[0], "sourceType">,
): Promise<PolicyRewardResult | null> {
  return awardReadingPolicyReward({
    ...input,
    sourceType: READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
  });
}
