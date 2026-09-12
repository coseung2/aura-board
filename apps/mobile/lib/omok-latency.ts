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

export type OmokQualificationPhase =
  | "confirm_touch"
  | "pending_layout_commit"
  | "requester_ack_received"
  | "requester_layout_commit"
  | "peer_snapshot_received"
  | "peer_layout_commit"
  | "probe_discarded";

type OmokQualificationProbe = {
  sequence: number;
  sessionId: string;
  startedVersion: number;
  startedAtMs: number;
  requestId: string | null;
  acknowledgedVersion: number | null;
  pendingMarked: boolean;
};

const QUALIFICATION_PROBE_TTL_MS = 30_000;

const qualification = {
  nextSequence: 1,
  active: null as OmokQualificationProbe | null,
  peerVersions: new Map<string, number>(),
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

/**
 * Development-only physical-device markers. These are deliberately layout
 * boundaries, not paint claims: qualification tooling correlates their
 * monotonic logcat timestamps with the first subsequent Android frame present
 * timestamp from `dumpsys gfxinfo ... framestats`.
 */
export function beginOmokQualificationTouch(input: {
  sessionId: string;
  version: number;
  nativeEventTimestampMs: number;
}): void {
  if (!qualificationEnabled()) return;
  const probe: OmokQualificationProbe = {
    sequence: qualification.nextSequence++,
    sessionId: input.sessionId,
    startedVersion: input.version,
    startedAtMs: Date.now(),
    requestId: null,
    acknowledgedVersion: null,
    pendingMarked: false,
  };
  discardActiveProbe("superseded");
  qualification.active = probe;
  emitQualificationMarker("confirm_touch", {
    sequence: probe.sequence,
    sessionId: probe.sessionId,
    version: probe.startedVersion,
    nativeEventTimestampMs: input.nativeEventTimestampMs,
  });
}

/** Binds the touch/layout probe to the durable command without logging its id. */
export function bindOmokQualificationRequest(
  sessionId: string,
  requestId: string,
  startedVersion: number,
): void {
  const probe = getActiveProbe();
  if (
    !qualificationEnabled() ||
    !probe ||
    probe.sessionId !== sessionId ||
    probe.startedVersion !== startedVersion ||
    probe.requestId !== null
  ) {
    return;
  }
  probe.requestId = requestId;
}

export function markOmokQualificationPendingLayout(sessionId: string): void {
  const probe = getActiveProbe();
  if (!qualificationEnabled() || !probe || probe.sessionId !== sessionId || probe.pendingMarked) {
    return;
  }
  probe.pendingMarked = true;
  emitQualificationMarker("pending_layout_commit", {
    sequence: probe.sequence,
    sessionId,
    version: probe.startedVersion,
  });
}

export function markOmokQualificationRequesterAck(
  sessionId: string,
  requestId: string,
  version: number,
): void {
  const probe = getActiveProbe();
  if (
    !qualificationEnabled() ||
    !probe ||
    probe.sessionId !== sessionId ||
    probe.requestId !== requestId ||
    version <= probe.startedVersion
  ) {
    return;
  }
  probe.acknowledgedVersion = version;
  emitQualificationMarker("requester_ack_received", {
    sequence: probe.sequence,
    sessionId,
    version,
  });
}

export function markOmokQualificationPeerSnapshot(
  sessionId: string,
  version: number,
): void {
  if (!qualificationEnabled()) return;
  const probe = getActiveProbe();
  if (probe?.sessionId === sessionId && version > probe.startedVersion) return;
  const now = Date.now();
  pruneExpiredPeerVersions(now);
  const key = peerVersionKey(sessionId, version);
  if (qualification.peerVersions.has(key)) return;
  qualification.peerVersions.set(key, now);
  emitQualificationMarker("peer_snapshot_received", { sessionId, version });
}

export function markOmokQualificationAuthoritativeLayout(
  sessionId: string,
  version: number,
): void {
  if (!qualificationEnabled()) return;
  pruneExpiredPeerVersions(Date.now());
  const probe = getActiveProbe();
  if (
    probe &&
    probe.sessionId === sessionId &&
    probe.acknowledgedVersion === version
  ) {
    emitQualificationMarker("requester_layout_commit", {
      sequence: probe.sequence,
      sessionId,
      version,
    });
    qualification.active = null;
    return;
  }
  if (qualification.peerVersions.delete(peerVersionKey(sessionId, version))) {
    emitQualificationMarker("peer_layout_commit", { sessionId, version });
  }
}

export function discardOmokQualificationProbe(
  sessionId: string,
  requestId?: string,
  reason = "unsettled",
): void {
  const probe = getActiveProbe();
  if (
    !qualificationEnabled() ||
    !probe ||
    probe.sessionId !== sessionId ||
    (requestId !== undefined && probe.requestId !== requestId)
  ) {
    return;
  }
  discardActiveProbe(reason);
}

/** Test isolation for this process-local development diagnostic. */
export function resetOmokQualificationForTests(): void {
  qualification.nextSequence = 1;
  qualification.active = null;
  qualification.peerVersions.clear();
}

function getActiveProbe(): OmokQualificationProbe | null {
  const probe = qualification.active;
  if (probe && Date.now() - probe.startedAtMs > QUALIFICATION_PROBE_TTL_MS) {
    discardActiveProbe("expired");
    return null;
  }
  return probe;
}

function discardActiveProbe(reason: string): void {
  const probe = qualification.active;
  if (!probe) return;
  emitQualificationMarker("probe_discarded", {
    sequence: probe.sequence,
    sessionId: probe.sessionId,
    version: probe.startedVersion,
    reason,
  });
  qualification.active = null;
}

function peerVersionKey(sessionId: string, version: number): string {
  return `${sessionId}:${version}`;
}

function pruneExpiredPeerVersions(now: number): void {
  for (const [key, receivedAtMs] of qualification.peerVersions) {
    if (now - receivedAtMs > QUALIFICATION_PROBE_TTL_MS) {
      qualification.peerVersions.delete(key);
    }
  }
}

function qualificationEnabled(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function emitQualificationMarker(
  phase: OmokQualificationPhase,
  fields: Record<string, number | string>,
): void {
  console.info(`[OMOK_QUALIFICATION] ${JSON.stringify({ phase, ...fields })}`);
}
