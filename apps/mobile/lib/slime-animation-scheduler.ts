/**
 * Shared exact-due-time animation scheduler for mounted slime sprites.
 *
 * Many catalog and pet cards advance frames independently. A per-sprite
 * setTimeout/setInterval multiplies native timers by the number of visible
 * previews. This module keeps every due callback on one underlying timer and
 * fires subscribers in due-time order without quantizing frame durations.
 */

export type SlimeAnimationScheduleHandle = {
  readonly id: number;
};

type ScheduledCallback = () => void;

type ScheduleEntry = {
  id: number;
  dueAt: number;
  callback: ScheduledCallback;
  /** When set, the entry is re-armed after each fire at a fixed cadence. */
  intervalMs: number | null;
};

let nextScheduleId = 1;
const entries = new Map<number, ScheduleEntry>();
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeTimerDueAt: number | null = null;

function clearActiveTimer() {
  if (activeTimer == null) return;
  clearTimeout(activeTimer);
  activeTimer = null;
  activeTimerDueAt = null;
}

function earliestDueAt(): number | null {
  let earliest: number | null = null;
  for (const entry of entries.values()) {
    if (earliest == null || entry.dueAt < earliest) {
      earliest = entry.dueAt;
    }
  }
  return earliest;
}

function armTimer() {
  const dueAt = earliestDueAt();
  if (dueAt == null) {
    clearActiveTimer();
    return;
  }

  // Keep the current timer when it already targets the same absolute due time.
  if (activeTimer != null && activeTimerDueAt === dueAt) {
    return;
  }

  clearActiveTimer();
  const delayMs = Math.max(0, dueAt - Date.now());
  activeTimerDueAt = dueAt;
  activeTimer = setTimeout(flushDueEntries, delayMs);
}

function flushDueEntries() {
  activeTimer = null;
  activeTimerDueAt = null;

  const now = Date.now();
  const dueEntries = Array.from(entries.values())
    .filter((entry) => entry.dueAt <= now)
    .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);

  for (const entry of dueEntries) {
    // A prior callback may have cancelled this entry during the same flush.
    if (!entries.has(entry.id)) continue;

    if (entry.intervalMs == null) {
      entries.delete(entry.id);
    } else {
      // Preserve independent cadence. Skip burst catch-up so a late frame does
      // not spin the wheel multiple times in one flush.
      do {
        entry.dueAt += entry.intervalMs;
      } while (entry.dueAt <= now);
    }

    entry.callback();
  }

  armTimer();
}

function scheduleEntry(
  delayMs: number,
  callback: ScheduledCallback,
  intervalMs: number | null,
): SlimeAnimationScheduleHandle {
  const id = nextScheduleId++;
  const safeDelay = Math.max(0, delayMs);
  entries.set(id, {
    id,
    dueAt: Date.now() + safeDelay,
    callback,
    intervalMs,
  });
  armTimer();
  return { id };
}

/** One-shot callback after `delayMs`, using the shared exact-due timer. */
export function scheduleSlimeAnimationTimeout(
  delayMs: number,
  callback: ScheduledCallback,
): SlimeAnimationScheduleHandle {
  return scheduleEntry(delayMs, callback, null);
}

/**
 * Repeating callback on a fixed period, using the shared exact-due timer.
 * Matches the previous per-sprite setInterval cadence for vehicle wheels.
 */
export function scheduleSlimeAnimationInterval(
  periodMs: number,
  callback: ScheduledCallback,
): SlimeAnimationScheduleHandle {
  const period = Math.max(16, Math.trunc(periodMs));
  return scheduleEntry(period, callback, period);
}

export function cancelSlimeAnimationSchedule(
  handle: SlimeAnimationScheduleHandle | null | undefined,
): void {
  if (!handle) return;
  if (!entries.delete(handle.id)) return;
  armTimer();
}

/** Test-only surface for fake-timer assertions. Not used by production UI. */
export function resetSlimeAnimationSchedulerForTests(): void {
  clearActiveTimer();
  entries.clear();
  nextScheduleId = 1;
}

export function getSlimeAnimationSchedulerSnapshotForTests(): {
  pendingCount: number;
  hasActiveTimer: boolean;
  activeTimerDueAt: number | null;
  nextDueAt: number | null;
} {
  return {
    pendingCount: entries.size,
    hasActiveTimer: activeTimer != null,
    activeTimerDueAt,
    nextDueAt: earliestDueAt(),
  };
}
