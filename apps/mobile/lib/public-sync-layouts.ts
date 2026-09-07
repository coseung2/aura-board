/** Public read paths only; kept in parity with the server rollout contract by
 * the public synchronization regression test. This does not grant access. */
export const PUBLIC_SYNC_LAYOUTS = [
  "freeform", "columns", "dj-queue", "plant-roadmap", "grid", "event-signup",
] as const;
export function isPublicSyncLayout(layout: string): boolean {
  return (PUBLIC_SYNC_LAYOUTS as readonly string[]).includes(layout);
}
