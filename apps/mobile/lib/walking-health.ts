import { Platform } from "react-native";
import { apiFetch } from "./api";
import AuraBoardHealthConnectModule from "../modules/aura-board-health-connect/src/AuraBoardHealthConnectModule";
import type {
  HealthConnectDailyStats,
  HealthConnectPermission,
  HealthConnectStatus,
} from "../modules/aura-board-health-connect/src/AuraBoardHealthConnect.types";

export type WalkingDay = {
  day: string;
  steps: number;
  distanceMeters: number;
  syncedAt: string | null;
};

export type WalkingWeekRange = {
  weekStart: string;
  weekEnd: string;
  today: string;
};

export type WalkingWeeklyRewardTier = {
  key: string;
  steps: number;
  amount: number;
};

export type WalkingPolicy = {
  stepThreshold: number;
  dailyUnitAmount: number;
  dailyUnitCap: number;
  weeklyRewardDayCap: number;
  weeklyTiers: WalkingWeeklyRewardTier[];
};

export type WalkingMonthlyAttendanceReward = {
  month: string;
  monthDays: number;
  attendanceCount: number;
  visitCount?: number;
  claimedOrdinals?: number[];
  claimableAttendance?: Array<{ ordinal: number; day: string }>;
  attendanceDays?: string[];
  eligibleAttendanceDays?: string[];
  cashEarned: number;
  cashPaid: number;
  nextOrdinalReward: {
    ordinal: number;
    type: "cash" | "item";
    amount: number;
  } | null;
  itemRewardOrdinal: number;
  itemEarned: boolean;
};

export type WalkingWeeklyStepReward = {
  key: string;
  steps: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
};

export type WalkingWeeklyStepRewards = {
  weekStart: string;
  totalSteps: number;
  maxSteps: number;
  tiers: WalkingWeeklyStepReward[];
};

/**
 * Keep the mobile progress view aligned with the server's weekly reward
 * contract (`src/lib/reward-policy.ts`). The server is the source of truth
 * for payouts; these values are only used to explain progress in the student
 * UI.
 */
export const WALKING_WEEKLY_REWARD_TIERS = [
  { key: "tier1", steps: 25_000, amount: 20 },
  { key: "tier2", steps: 50_000, amount: 40 },
  { key: "tier3", steps: 75_000, amount: 100 },
] as const satisfies ReadonlyArray<{
  key: `tier${1 | 2 | 3}`;
  steps: number;
  amount: number;
}>;

/** Mirrors the server's default daily walking reward threshold. */
export const WALKING_DAILY_REWARD_STEP_THRESHOLD = 5_000;

export const DEFAULT_WALKING_POLICY: WalkingPolicy = {
  stepThreshold: WALKING_DAILY_REWARD_STEP_THRESHOLD,
  dailyUnitAmount: 10,
  dailyUnitCap: 4,
  weeklyRewardDayCap: 5,
  weeklyTiers: WALKING_WEEKLY_REWARD_TIERS.map((tier) => ({ ...tier })),
};

const REQUIRED_PERMISSIONS: HealthConnectPermission[] = ["steps"];
const MAX_STEPS_PER_DAY = 200_000;
const MAX_DISTANCE_METERS_PER_DAY = 300_000;

export const WALKING_TIME_ZONE = "Asia/Seoul";

export type WalkingHealthErrorCode =
  | "module_unavailable"
  | "provider_unavailable"
  | "provider_update_required"
  | "provider_error"
  | "permission_required"
  | "rate_limited"
  | "unknown";

const HEALTH_CONNECT_ERROR_MESSAGES: Record<WalkingHealthErrorCode, string> = {
  module_unavailable: "이 Android 앱 빌드에서는 Health Connect를 사용할 수 없습니다.",
  provider_unavailable: "이 기기에서는 Health Connect를 사용할 수 없습니다.",
  provider_update_required:
    "Health Connect 업데이트가 필요해요. 업데이트 후 다시 시도해 주세요.",
  provider_error: "Health Connect에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  permission_required:
    "걸음 수 권한이 필요해요. Health Connect 설정에서 권한을 허용해 주세요.",
  rate_limited:
    "Health Connect 요청이 잠시 제한되었어요. 잠시 후 다시 시도해 주세요.",
  unknown: "Health Connect 요청에 실패했어요.",
};

export class WalkingHealthError extends Error {
  constructor(
    readonly code: WalkingHealthErrorCode,
    message = HEALTH_CONNECT_ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = "WalkingHealthError";
  }
}

function walkingHealthErrorCode(error: unknown): WalkingHealthErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("HEALTH_CONNECT_PERMISSION_REQUIRED")) {
    return "permission_required";
  }
  if (message.includes("HEALTH_CONNECT_PROVIDER_UPDATE_REQUIRED")) {
    return "provider_update_required";
  }
  if (message.includes("HEALTH_CONNECT_PROVIDER_UNAVAILABLE")) {
    return "provider_unavailable";
  }
  if (message.includes("HEALTH_CONNECT_PROVIDER_ERROR")) {
    return "provider_error";
  }
  if (message.includes("HEALTH_CONNECT_RATE_LIMITED")) {
    return "rate_limited";
  }
  return "unknown";
}

function asWalkingHealthError(error: unknown) {
  if (error instanceof WalkingHealthError) return error;
  const code = walkingHealthErrorCode(error);
  const rawMessage = error instanceof Error ? error.message : String(error);
  return new WalkingHealthError(
    code,
    code === "unknown" && rawMessage ? rawMessage : undefined,
  );
}

function formatUtcDayKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function toLocalDayKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: WALKING_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Return the current KST Monday-to-Sunday calendar week. */
export function getCurrentWalkingWeekRange(now = new Date()): WalkingWeekRange {
  const today = toLocalDayKey(now);
  const start = parseDayKey(today);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    weekStart: formatUtcDayKey(start),
    weekEnd: formatUtcDayKey(end),
    today,
  };
}

/** Fill a Monday-Sunday week, keeping future days visible but unsynced. */
export function fillCurrentWalkingWeek(
  rows: WalkingDay[],
  range: WalkingWeekRange = getCurrentWalkingWeekRange(),
) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const start = parseDayKey(range.weekStart);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const day = formatUtcDayKey(date);
    return byDay.get(day) ?? {
      day,
      steps: 0,
      distanceMeters: 0,
      syncedAt: null,
    };
  });
}

/** @deprecated Use getCurrentWalkingWeekRange for all new callers. */
export function getRecentDayRange(_days = 7) {
  const range = getCurrentWalkingWeekRange();
  return { days: 7, startDay: range.weekStart, endDay: range.today };
}

/** @deprecated Use fillCurrentWalkingWeek for all new callers. */
export function fillRecentWalkingDays(rows: WalkingDay[], _days = 7) {
  return fillCurrentWalkingWeek(rows);
}

function normalizeNativeDay(row: HealthConnectDailyStats): WalkingDay {
  const stepsValue = Number(row.steps);
  const distanceValue = Number(row.distanceMeters);
  return {
    day: row.day,
    steps: Number.isFinite(stepsValue)
      ? Math.min(MAX_STEPS_PER_DAY, Math.max(0, Math.round(stepsValue)))
      : 0,
    distanceMeters: Number.isFinite(distanceValue)
      ? Math.min(MAX_DISTANCE_METERS_PER_DAY, Math.max(0, distanceValue))
      : 0,
    syncedAt: null,
  };
}

export function isWalkingHealthModuleAvailable() {
  return (
    (Platform.OS === "android" || Platform.OS === "ios") &&
    AuraBoardHealthConnectModule !== null
  );
}

export function isHealthConnectModuleAvailable() {
  return isWalkingHealthModuleAvailable();
}

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    return "unavailable";
  }
  try {
    return await AuraBoardHealthConnectModule.getStatus();
  } catch (error) {
    throw asWalkingHealthError(error);
  }
}

export async function getGrantedHealthConnectPermissions() {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) return [];
  try {
    return await AuraBoardHealthConnectModule.getGrantedPermissions();
  } catch (error) {
    throw asWalkingHealthError(error);
  }
}

export function hasRequiredHealthConnectPermissions(
  permissions: HealthConnectPermission[],
) {
  return REQUIRED_PERMISSIONS.every((permission) => permissions.includes(permission));
}

export async function requestHealthConnectPermissions() {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new WalkingHealthError("module_unavailable");
  }
  try {
    return await AuraBoardHealthConnectModule.requestPermissions();
  } catch (error) {
    throw asWalkingHealthError(error);
  }
}

export async function openHealthConnectSettings() {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new WalkingHealthError("module_unavailable", "Health Connect 설정을 열 수 없습니다.");
  }
  try {
    await AuraBoardHealthConnectModule.openSettings();
  } catch (error) {
    throw asWalkingHealthError(error);
  }
}

export type WalkingResponse = {
  rows: WalkingDay[];
  range?: Pick<WalkingWeekRange, "weekStart" | "weekEnd">;
  policy: WalkingPolicy;
  monthlyAttendanceReward: WalkingMonthlyAttendanceReward;
  weeklyStepRewards: WalkingWeeklyStepRewards;
};

function safePolicyInteger(value: unknown, fallback: number, minimum = 0) {
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate >= minimum ? candidate : fallback;
}

/** Normalize the additive API policy while keeping older servers compatible. */
export function normalizeWalkingPolicy(value: unknown): WalkingPolicy {
  if (!value || typeof value !== "object") return DEFAULT_WALKING_POLICY;
  const raw = value as Record<string, unknown>;
  const rawTiers = Array.isArray(raw.weeklyTiers) ? raw.weeklyTiers : [];
  const weeklyTiers = rawTiers
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const tier = entry as Record<string, unknown>;
      const fallback = DEFAULT_WALKING_POLICY.weeklyTiers[index];
      if (!fallback || typeof tier.key !== "string" || tier.key.length === 0) return null;
      return {
        key: tier.key,
        steps: safePolicyInteger(tier.steps, fallback.steps, 1),
        amount: safePolicyInteger(tier.amount, fallback.amount),
      };
    })
    .filter((tier): tier is WalkingWeeklyRewardTier => tier !== null);

  return {
    stepThreshold: safePolicyInteger(
      raw.stepThreshold,
      DEFAULT_WALKING_POLICY.stepThreshold,
      1,
    ),
    dailyUnitAmount: safePolicyInteger(
      raw.dailyUnitAmount,
      DEFAULT_WALKING_POLICY.dailyUnitAmount,
    ),
    dailyUnitCap: safePolicyInteger(raw.dailyUnitCap, DEFAULT_WALKING_POLICY.dailyUnitCap),
    weeklyRewardDayCap: safePolicyInteger(
      raw.weeklyRewardDayCap,
      DEFAULT_WALKING_POLICY.weeklyRewardDayCap,
    ),
    weeklyTiers:
      weeklyTiers.length > 0 ? weeklyTiers : DEFAULT_WALKING_POLICY.weeklyTiers,
  };
}

export async function fetchWalkingSnapshot(_days?: number): Promise<WalkingResponse> {
  const payload = await apiFetch<{
    rows: WalkingDay[];
    range?: Pick<WalkingWeekRange, "weekStart" | "weekEnd">;
    policy?: unknown;
    monthlyAttendanceReward: WalkingMonthlyAttendanceReward;
    weeklyStepRewards: WalkingWeeklyStepRewards;
  }>("/api/student/walking?week=current");
  return {
    rows: payload.rows,
    range: payload.range,
    policy: normalizeWalkingPolicy(payload.policy),
    monthlyAttendanceReward: payload.monthlyAttendanceReward,
    weeklyStepRewards: payload.weeklyStepRewards,
  };
}

export async function markWalkingAttendance(days: string[]) {
  await apiFetch("/api/student/walking", {
    method: "POST",
    json: { attendanceDays: days },
  });
  // The mutation response is intentionally smaller than the GET snapshot and
  // does not include policy/weekly reward fields required by the mission view.
  return fetchWalkingSnapshot();
}

export async function recordWalkingAttendanceVisit() {
  return apiFetch("/api/student/walking", {
    method: "POST",
    json: { attendanceVisit: true },
  });
}

export async function fetchWalkingDays(_days?: number) {
  return (await fetchWalkingSnapshot()).rows;
}

export async function readAndSyncWalkingDays(_days?: number) {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new WalkingHealthError("module_unavailable");
  }

  const range = getCurrentWalkingWeekRange();
  let nativeRows: WalkingDay[];
  try {
    nativeRows = (
      await AuraBoardHealthConnectModule.readDailyStats(range.weekStart, range.today)
    ).map(normalizeNativeDay);
  } catch (error) {
    throw asWalkingHealthError(error);
  }

  // Health Connect should never send a future day to the API, even when the
  // provider returns an unexpected row outside the requested interval.
  const boundedNativeRows = nativeRows.filter(
    (row) => row.day >= range.weekStart && row.day <= range.today,
  );

  const payload = await apiFetch<{ rows: WalkingDay[] }>("/api/student/walking", {
    method: "POST",
    json: {
      rows: boundedNativeRows.map((row) => ({
        day: row.day,
        steps: row.steps,
        // Keep the existing API/database contract compatible without requesting
        // or reading a separate distance permission from the device.
        distanceMeters: 0,
      })),
    },
  });

  return payload.rows.filter(
    (row) => row.day >= range.weekStart && row.day <= range.today,
  );
}
