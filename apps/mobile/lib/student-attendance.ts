import { apiFetch } from "./api";
import { cachedRequest } from "./request-cache";
import type { WalkingMonthlyAttendanceReward } from "./walking-health";

/** Record the app-wide daily attendance visit. The server de-duplicates per KST day. */
export async function recordStudentAttendanceVisit() {
  return cachedRequest({
    key: "student:attendance-visit",
    ttlMs: 5 * 60_000,
    loader: () => apiFetch("/api/student/attendance", { method: "POST" }),
  });
}

/** Claim the attendance reward for one visited day. */
export async function claimStudentAttendanceReward(day: string) {
  return apiFetch<{ attendance: WalkingMonthlyAttendanceReward }>("/api/student/attendance", {
    method: "PATCH",
    json: { day },
  });
}
