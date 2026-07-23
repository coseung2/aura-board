export type HealthConnectStatus = "available" | "needs_update" | "unavailable";

export type HealthConnectPermission = "steps";

export type HealthConnectDailyStats = {
  day: string;
  steps: number;
  distanceMeters: number;
};
