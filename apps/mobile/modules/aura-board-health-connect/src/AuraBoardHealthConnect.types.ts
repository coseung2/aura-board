export type HealthConnectStatus = "available" | "needs_update" | "unavailable";

export type HealthConnectPermission = "steps" | "distance";

export type HealthConnectDailyStats = {
  day: string;
  steps: number;
  distanceMeters: number;
};
