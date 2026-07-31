import "server-only";
import { createHash } from "crypto";
import {
  _resetParentSecurityStoreForTests,
  checkSlidingWindow,
  recordSlidingWindow,
  sensitiveKey,
} from "./parent-security-store";

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function isIpLocked(ip: string | null | undefined): Promise<boolean> {
  if (!ip) return false;
  const result = await checkSlidingWindow(
    sensitiveKey("parent-security:signup-ip", ip),
    LIMIT,
    WINDOW_MS,
  );
  return !result.ok;
}

export async function recordIpFailure(ip: string | null | undefined): Promise<void> {
  if (!ip) return;
  await recordSlidingWindow(sensitiveKey("parent-security:signup-ip", ip), WINDOW_MS);
}

export function extractClientIp(req: Request): string | null {
  const h = req.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = h.get("x-real-ip");
  if (xri) return xri.trim();
  return null;
}

export function _resetBucketsForTests(): void {
  _resetParentSecurityStoreForTests();
}
