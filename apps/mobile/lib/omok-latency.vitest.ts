import { describe, expect, it } from "vitest";
import { OmokLatencyCollector } from "./omok-latency";

describe("Omok latency telemetry", () => {
  it("correlates pending and commit without exposing correlation or identity labels", () => {
    let now = 100;
    const collector = new OmokLatencyCollector(10, () => now);
    const startedAt = collector.beginConfirm();
    now = 104;
    collector.markPending("place_stone.private-request", startedAt);
    now = 140;
    collector.markCommitted("place_stone.private-request");

    const output = collector.snapshot();
    expect(output.samples).toEqual([
      {
        phase: "confirm_to_pending_dispatch",
        durationMs: 4,
      },
      {
        phase: "confirm_to_commit",
        durationMs: 40,
      },
    ]);
    expect(Object.keys(output.samples[0]!).sort()).toEqual(["durationMs", "phase"]);
    expect(Object.keys(output.summaries[0]!).sort()).toEqual([
      "count",
      "maxMs",
      "p50Ms",
      "p95Ms",
      "phase",
    ]);
    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain("private-request");
    expect(serialized).not.toContain("session-");
    expect(serialized).not.toContain("student");
    expect(serialized).not.toContain("ticket");
  });

  it("ignores uncorrelated commits and bounds retained samples", () => {
    let now = 0;
    const collector = new OmokLatencyCollector(2, () => now);
    collector.markCommitted("unknown");
    for (const duration of [1, 2, 3]) {
      const receivedAt = now;
      now += duration;
      collector.markPeerSnapshotDispatched(receivedAt);
    }
    expect(collector.snapshot().samples.map((sample) => sample.durationMs)).toEqual([2, 3]);
  });

  it("reports nearest-rank percentiles for each phase", () => {
    let now = 0;
    const collector = new OmokLatencyCollector(20, () => now);
    for (const duration of [1, 2, 3, 4, 100]) {
      const receivedAt = now;
      now += duration;
      collector.markPeerSnapshotDispatched(receivedAt);
    }
    expect(collector.snapshot().summaries).toEqual([
      {
        phase: "peer_snapshot_dispatch",
        count: 5,
        p50Ms: 3,
        p95Ms: 100,
        maxMs: 100,
      },
    ]);
  });
});
