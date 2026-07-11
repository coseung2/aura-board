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

function clampDays(days: number) {
  return Math.min(31, Math.max(1, Math.round(days)));
}

export function toLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRecentDayRange(days = 7) {
  const normalizedDays = clampDays(days);
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (normalizedDays - 1));
  return {
    days: normalizedDays,
    startDay: toLocalDayKey(start),
    endDay: toLocalDayKey(end),
  };
}

export function fillRecentWalkingDays(rows: WalkingDay[], days = 7) {
  const { days: count } = getRecentDayRange(days);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    const day = toLocalDayKey(date);
    return byDay.get(day) ?? {
      day,
      steps: 0,
      distanceMeters: 0,
      syncedAt: null,
    };
  });
}

function normalizeNativeDay(row: HealthConnectDailyStats): WalkingDay {
  return {
    day: row.day,
    steps: Math.max(0, Math.round(Number(row.steps) || 0)),
    distanceMeters: Math.max(0, Number(row.distanceMeters) || 0),
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
  return AuraBoardHealthConnectModule.getStatus();
}

export async function getGrantedHealthConnectPermissions() {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) return [];
  return AuraBoardHealthConnectModule.getGrantedPermissions();
}

export function hasRequiredHealthConnectPermissions(
  permissions: HealthConnectPermission[],
) {
  return REQUIRED_PERMISSIONS.every((permission) => permissions.includes(permission));
}

export async function requestHealthConnectPermissions() {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new Error("이 Android 빌드에서는 Health Connect를 사용할 수 없습니다.");
  }
  return AuraBoardHealthConnectModule.requestPermissions();
}

export async function openHealthConnectSettings() {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new Error("Health Connect 설정을 열 수 없습니다.");
  }
  await AuraBoardHealthConnectModule.openSettings();
}

export async function fetchWalkingDays(days = 7) {
  const payload = await apiFetch<{ rows: WalkingDay[] }>(
    `/api/student/walking?days=${clampDays(days)}`,
  );
  return payload.rows;
}

export async function readAndSyncWalkingDays(days = 7) {
  if (!isHealthConnectModuleAvailable() || !AuraBoardHealthConnectModule) {
    throw new Error("이 Android 빌드에서는 Health Connect를 사용할 수 없습니다.");
  }

  const range = getRecentDayRange(days);
  const nativeRows = (
    await AuraBoardHealthConnectModule.readDailyStats(range.startDay, range.endDay)
  ).map(normalizeNativeDay);

  const payload = await apiFetch<{ rows: WalkingDay[] }>("/api/student/walking", {
    method: "POST",
    json: {
      rows: nativeRows.map((row) => ({
        day: row.day,
        steps: row.steps,
        distanceMeters: Math.round(row.distanceMeters * 100) / 100,
      })),
    },
  });

  return payload.rows.filter(
    (row) => row.day >= range.startDay && row.day <= range.endDay,
  );
}
