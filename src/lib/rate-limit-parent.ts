import "server-only";
import {
  _resetParentSecurityStoreForTests,
  checkSlidingWindow,
  consumeSlidingWindow,
  recordSlidingWindow,
  sensitiveKey,
} from "./parent-security-store";

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type MatchAxis = "ip" | "code" | "classroom";

const MATCH_LIMITS: Record<MatchAxis, { limit: number; windowMs: number }> = {
  ip: { limit: 5, windowMs: FIFTEEN_MIN_MS },
  code: { limit: 50, windowMs: ONE_DAY_MS },
  classroom: { limit: 100, windowMs: ONE_DAY_MS },
};

export async function checkMatchLimit(
  ip: string | null,
  code: string | null,
  classroomId: string | null,
): Promise<{ ok: true } | { ok: false; axis: MatchAxis; retryAfterSec: number }> {
  const axes: Array<[MatchAxis, string | null]> = [
    ["ip", ip],
    ["code", code],
    ["classroom", classroomId],
  ];
  for (const [axis, value] of axes) {
    if (!value) continue;
    const config = MATCH_LIMITS[axis];
    const result = await consumeSlidingWindow(
      sensitiveKey(`parent-security:match:${axis}`, value),
      config.limit,
      config.windowMs,
    );
    if (!result.ok) return { ok: false, axis, retryAfterSec: result.retryAfterSec };
  }
  return { ok: true };
}

export async function checkRejectionCooldown(
  parentEmail: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const result = await checkSlidingWindow(
    sensitiveKey("parent-security:rejection", parentEmail.toLowerCase()),
    3,
    ONE_DAY_MS,
  );
  return result.ok ? { ok: true } : { ok: false, retryAfterSec: result.retryAfterSec };
}

export async function recordRejection(parentEmail: string): Promise<void> {
  await recordSlidingWindow(
    sensitiveKey("parent-security:rejection", parentEmail.toLowerCase()),
    ONE_DAY_MS,
  );
}

export function _resetAllForTests(): void {
  _resetParentSecurityStoreForTests();
}
