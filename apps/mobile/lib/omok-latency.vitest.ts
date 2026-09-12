import { describe, expect, it, vi } from "vitest";
import {
  beginOmokQualificationTouch,
  bindOmokQualificationRequest,
  discardOmokQualificationProbe,
  markOmokQualificationAuthoritativeLayout,
  markOmokQualificationPeerSnapshot,
  markOmokQualificationPendingLayout,
  markOmokQualificationRequesterAck,
  OmokLatencyCollector,
  resetOmokQualificationForTests,
} from "./omok-latency";

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

describe("Omok physical qualification markers", () => {
  it("correlates touch, pending, ack, requester layout, and peer layout boundaries", () => {
    vi.stubGlobal("__DEV__", true);
    resetOmokQualificationForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    beginOmokQualificationTouch({
      sessionId: "qualification-session",
      version: 16,
      nativeEventTimestampMs: 12_345,
    });
    bindOmokQualificationRequest("qualification-session", "private-request-1", 16);
    markOmokQualificationPendingLayout("qualification-session");
    markOmokQualificationPendingLayout("qualification-session");
    markOmokQualificationRequesterAck("qualification-session", "private-request-1", 17);
    markOmokQualificationAuthoritativeLayout("qualification-session", 17);
    markOmokQualificationPeerSnapshot("qualification-session", 18);
    markOmokQualificationAuthoritativeLayout("qualification-session", 18);

    const markers = info.mock.calls.map(([line]) => String(line));
    expect(markers).toHaveLength(6);
    expect(markers.join("\n")).toContain('"phase":"confirm_touch"');
    expect(markers.join("\n")).toContain('"nativeEventTimestampMs":12345');
    expect(markers.join("\n")).toContain('"phase":"pending_layout_commit"');
    expect(markers.join("\n")).toContain('"phase":"requester_ack_received"');
    expect(markers.join("\n")).toContain('"phase":"requester_layout_commit"');
    expect(markers.join("\n")).toContain('"phase":"peer_snapshot_received"');
    expect(markers.join("\n")).toContain('"phase":"peer_layout_commit"');

    info.mockRestore();
    vi.unstubAllGlobals();
  });

  it("does not let another request, session, or stale version settle a requester probe", () => {
    vi.stubGlobal("__DEV__", true);
    resetOmokQualificationForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    beginOmokQualificationTouch({
      sessionId: "requester-session",
      version: 20,
      nativeEventTimestampMs: 1,
    });
    bindOmokQualificationRequest("requester-session", "private-request-2", 20);
    markOmokQualificationRequesterAck("requester-session", "another-request", 21);
    markOmokQualificationRequesterAck("requester-session", "private-request-2", 20);
    markOmokQualificationAuthoritativeLayout("requester-session", 21);
    markOmokQualificationPeerSnapshot("other-session", 21);
    markOmokQualificationAuthoritativeLayout("requester-session", 21);
    discardOmokQualificationProbe("requester-session", "private-request-2", "connection_error");

    const markers = info.mock.calls.map(([line]) => String(line)).join("\n");
    expect(markers).not.toContain('"phase":"requester_ack_received"');
    expect(markers).not.toContain('"phase":"requester_layout_commit"');
    expect(markers).not.toContain('"phase":"peer_layout_commit"');
    expect(markers).toContain('"phase":"probe_discarded"');
    expect(markers).not.toContain("private-request-2");

    info.mockRestore();
    vi.unstubAllGlobals();
  });

  it("supersedes consecutive touches and clears rejected probes", () => {
    vi.stubGlobal("__DEV__", true);
    resetOmokQualificationForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    beginOmokQualificationTouch({ sessionId: "session-a", version: 1, nativeEventTimestampMs: 1 });
    beginOmokQualificationTouch({ sessionId: "session-a", version: 1, nativeEventTimestampMs: 2 });
    bindOmokQualificationRequest("session-a", "private-request-3", 1);
    discardOmokQualificationProbe("session-a", "private-request-3", "command_rejected");
    markOmokQualificationRequesterAck("session-a", "private-request-3", 2);
    markOmokQualificationAuthoritativeLayout("session-a", 2);

    const markers = info.mock.calls.map(([line]) => String(line));
    expect(markers.filter((line) => line.includes('"phase":"probe_discarded"'))).toHaveLength(2);
    expect(markers.some((line) => line.includes('"phase":"requester_layout_commit"'))).toBe(false);

    info.mockRestore();
    vi.unstubAllGlobals();
  });

  it("clears an unconfirmed transport probe without affecting later peer markers", () => {
    vi.stubGlobal("__DEV__", true);
    resetOmokQualificationForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    beginOmokQualificationTouch({ sessionId: "session-a", version: 3, nativeEventTimestampMs: 3 });
    bindOmokQualificationRequest("session-a", "private-request-4", 3);
    discardOmokQualificationProbe("session-a", "private-request-4", "http_unconfirmed");
    markOmokQualificationPeerSnapshot("session-a", 4);
    markOmokQualificationAuthoritativeLayout("session-a", 4);

    const markers = info.mock.calls.map(([line]) => String(line)).join("\n");
    expect(markers).toContain('"reason":"http_unconfirmed"');
    expect(markers).toContain('"phase":"peer_layout_commit"');
    expect(markers).not.toContain('"phase":"requester_layout_commit"');

    info.mockRestore();
    vi.unstubAllGlobals();
  });

  it("deduplicates peer snapshots and expires an unsettled peer layout marker", () => {
    vi.stubGlobal("__DEV__", true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T09:00:00.000Z"));
    resetOmokQualificationForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    markOmokQualificationPeerSnapshot("peer-session", 9);
    markOmokQualificationPeerSnapshot("peer-session", 9);
    vi.advanceTimersByTime(30_001);
    markOmokQualificationAuthoritativeLayout("peer-session", 9);

    const markers = info.mock.calls.map(([line]) => String(line));
    expect(markers.filter((line) => line.includes('"phase":"peer_snapshot_received"'))).toHaveLength(1);
    expect(markers.some((line) => line.includes('"phase":"peer_layout_commit"'))).toBe(false);

    info.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
