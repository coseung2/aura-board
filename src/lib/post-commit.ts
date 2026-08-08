import "server-only";

type PostCommitJob = {
  label: string;
  task: () => Promise<void>;
};

const DEFAULT_POST_COMMIT_CONCURRENCY = 16;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const maxConcurrency = positiveInteger(
  process.env.POST_COMMIT_CONCURRENCY,
  DEFAULT_POST_COMMIT_CONCURRENCY,
);
const queue: PostCommitJob[] = [];
let active = 0;
let pumpScheduled = false;

function reportFailure(label: string, error: unknown): void {
  console.error(`[post-commit] ${label} failed`, {
    error: error instanceof Error ? error.message : String(error),
  });
}

function schedulePump(): void {
  if (pumpScheduled) return;
  pumpScheduled = true;
  setImmediate(pump);
}

function pump(): void {
  pumpScheduled = false;
  while (active < maxConcurrency && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    void job
      .task()
      .catch((error) => reportFailure(job.label, error))
      .finally(() => {
        active -= 1;
        if (queue.length > 0) schedulePump();
      });
  }
}

/**
 * Queue non-critical work after a committed request mutation without adding its
 * latency to the HTTP response. The bounded worker pool prevents a classroom
 * wave from opening hundreds of simultaneous DB/Realtime operations that then
 * compete with the next foreground request wave.
 */
export function schedulePostCommit(
  label: string,
  task: () => Promise<void>,
): void {
  queue.push({ label, task });
  schedulePump();
}

export function postCommitQueueStateForTests(): {
  active: number;
  queued: number;
  maxConcurrency: number;
} {
  return { active, queued: queue.length, maxConcurrency };
}
