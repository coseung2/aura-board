export type HealthConnectStatus = "available" | "needs_update" | "unavailable";

export type HealthConnectPermission = "steps";

export type HealthConnectDailyStats = {
  day: string;
  steps: number;
  distanceMeters: number;
};

export type LiveStepUpdate = {
  delta: number;
};

export type LiveStepUpdateStatus =
  | "started"
  | "permission_required"
  | "unavailable";

export type MotionPermissionStatus =
  | "authorized"
  | "not_determined"
  | "permission_required"
  | "unavailable";
