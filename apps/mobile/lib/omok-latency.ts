export type OmokLatencyPhase =
  | "confirm_to_pending_dispatch"
  | "confirm_to_commit"
  | "peer_snapshot_dispatch";

export type OmokLatencySample = {
  phase: OmokLatencyPhase;
  durationMs: number;
};

export type OmokLatencySummary = {
  phase: OmokLatencyPhase;
  count: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

type Clock = () => number;

/**
 * Bounded, process-local Omok timing telemetry. Correlation IDs are held only
 * until a command settles and are never returned, logged, or used as labels.
 * Session IDs, actors, students, tickets, commands, and snapshots are never
 * accepted by this collector at all.
 */
export class OmokLatencyCollector {
  private readonly samples: OmokLatencySample[] = [];
  private readonly pending = new Map<string, number>();

  constructor(
    private readonly capacity = 200,
    private readonly now: Clock = () => Date.now(),
  ) {}

  beginConfirm(): number {
    return this.now();
  }

  markPending(
    requestId: string,
    startedAt: number,
  ): void {
    const now = this.now();
    this.pending.set(requestId, startedAt);
    if (this.pending.size > Math.max(1, this.capacity)) {
      const oldest = this.pending.keys().next().value;
      if (oldest) this.pending.delete(oldest);
    }
    this.push({
      phase: "confirm_to_pending_dispatch",
      durationMs: elapsed(startedAt, now),
    });
  }

  markCommitted(requestId: string): void {
    const startedAt = this.pending.get(requestId);
    if (startedAt === undefined) return;
    this.pending.delete(requestId);
    this.push({
      phase: "confirm_to_commit",
      durationMs: elapsed(startedAt, this.now()),
    });
  }

  discard(requestId: string): void {
    this.pending.delete(requestId);
  }

  markPeerSnapshotDispatched(receivedAt: number): void {
    this.push({
      phase: "peer_snapshot_dispatch",
      durationMs: elapsed(receivedAt, this.now()),
    });
  }

  snapshot(): { samples: OmokLatencySample[]; summaries: OmokLatencySummary[] } {
    const samples = this.samples.map((sample) => ({ ...sample }));
    const summaries = ([
      "confirm_to_pending_dispatch",
      "confirm_to_commit",
      "peer_snapshot_dispatch",
    ] as const).flatMap((phase) => {
      const values = samples
        .filter((sample) => sample.phase === phase)
        .map((sample) => sample.durationMs)
        .sort((left, right) => left - right);
      if (!values.length) return [];
      return [{
        phase,
        count: values.length,
        p50Ms: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        maxMs: values[values.length - 1]!,
      }];
    });
    return { samples, summaries };
  }

  reset(): void {
    this.samples.length = 0;
    this.pending.clear();
  }

  private push(sample: OmokLatencySample): void {
    if (this.capacity <= 0) return;
    this.samples.push(sample);
    if (this.samples.length > this.capacity) {
      this.samples.splice(0, this.samples.length - this.capacity);
    }
  }
}

function elapsed(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function percentile(sorted: number[], ratio: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]!;
}

export const omokLatency = new OmokLatencyCollector();
