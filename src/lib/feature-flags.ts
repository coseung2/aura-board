/** UI-only experiment switch. Server release/ownership guards are separate. */
export type FeatureFlag = "breakoutSettings";

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (flag !== "breakoutSettings") return false;
  // Literal access is required for Next.js browser-bundle inlining. Keep the
  // historical env name so existing build configuration continues to work.
  const raw = process.env.NEXT_PUBLIC_FF_breakoutSettings?.trim().toLowerCase();
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return process.env.NODE_ENV !== "production";
}
