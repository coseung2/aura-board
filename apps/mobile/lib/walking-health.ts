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

const REQUIRED_PERMISSIONS: HealthConnectPermission[] = ["steps", "distance"];
const MAX_WALKING_DAYS = 31;
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
    "걸음 수와 거리 권한이 필요해요. Health Connect 설정에서 권한을 허용해 주세요.",
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

function clampDays(days: number) {
  if (!Number.isFinite(days)) return 7;
  return Math.min(MAX_WALKING_DAYS, Math.max(1, Math.round(days)));
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

export function getRecentDayRange(days = 7) {
  const normalizedDays = clampDays(days);
  const endDay = toLocalDayKey(new Date());
  const start = parseDayKey(endDay);
  start.setUTCDate(start.getUTCDate() - (normalizedDays - 1));
  return {
    days: normalizedDays,
    startDay: formatUtcDayKey(start),
    endDay,
  };
}

export function fillRecentWalkingDays(rows: WalkingDay[], days = 7) {
  const { days: count, startDay } = getRecentDayRange(days);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const start = parseDayKey(startDay);

  return Array.from({ length: count }, (_, index) => {
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

export function isHealthConnectModuleAvailable() {
  return Platform.OS === "android" && AuraBoardHealthConnectModule !== null;
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

export async function fetchWalkingDays(days = 7) {
  const payload = await apiFetch<{ rows: WalkingDay[] }>(
    `/api/student/walking?days=${clampDays(days)}`,
  );
  return payload.rows;
}

export async function readAndSyncWalkingDays(days = 7) {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new WalkingHealthError("module_unavailable");
  }

  const range = getRecentDayRange(days);
  let nativeRows: WalkingDay[];
  try {
    nativeRows = (
      await AuraBoardHealthConnectModule.readDailyStats(range.startDay, range.endDay)
    ).map(normalizeNativeDay);
  } catch (error) {
    throw asWalkingHealthError(error);
  }

  const payload = await apiFetch<{ rows: WalkingDay[] }>("/api/student/walking", {
    method: "POST",
    json: {
      rows: nativeRows.map((row) => ({
        day: row.day,
        steps: row.steps,
        distanceMeters:
          Math.round(Math.min(MAX_DISTANCE_METERS_PER_DAY, row.distanceMeters) * 100) /
          100,
      })),
    },
  });

  return payload.rows.filter(
    (row) => row.day >= range.startDay && row.day <= range.endDay,
  );
}
