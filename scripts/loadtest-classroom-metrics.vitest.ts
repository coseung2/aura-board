import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  estimateRealtimeWave,
  estimateRealtimeJoinSchedule,
  evaluateRealtimeApproval,
  evaluateRealtimeAllocation,
  exactSyntheticOutboxSources,
  expectedRealtimeMessageCounts,
  parseRequestValidation,
  recordRealtimeCallback,
  createAbortAwareDelay,
  nextRealtimeJoinStartAt,
  summarizeRealtimeJoinStarts,
  selectRealtimeActorsRoundRobin,
  summarizeCommentRewardSettlement,
} from "./loadtest-classroom-metrics.mjs";

describe("classroom load-test metrics", () => {
  const safeAllocation = {
    totalStudents: 1_000,
    realtimeClients: 400,
    baselineConnections: 50,
    connectionLimit: 500,
    connectionHeadroom: 50,
    realtimeWindowMs: 10_000,
    maxJoinRate: 100,
    messageLimit: 500,
    messageHeadroom: 50,
    baselineMessageRate: 0,
    maxDeliveryCallbackRate: 400,
  };

  it("rejects unsafe realtime allocation and accepts a bounded allocation", () => {
    expect(evaluateRealtimeAllocation({
      ...safeAllocation,
      realtimeClients: 401,
    }).failures).toEqual(expect.arrayContaining([
      "realtime_connection_allocation",
      "safe_projected_connection_ceiling",
    ]));
    expect(evaluateRealtimeAllocation(safeAllocation)).toMatchObject({
      accepted: true,
      availableConnections: 400,
      projectedConnections: 450,
      joinRatePerSecond: 40,
    });
  });

  it("requires a baseline and rejects a zero join window without a divide-by-zero loophole", () => {
    const common = {
      ...safeAllocation,
      realtimeClients: 20,
      baselineConnections: 0,
    };
    expect(evaluateRealtimeAllocation({
      ...common,
      baselineConnections: null,
      baselineMessageRate: null,
      realtimeWindowMs: 20_000,
    }).failures).toEqual(expect.arrayContaining([
      "realtime_baseline_required",
      "realtime_message_baseline_required",
    ]));
    expect(evaluateRealtimeAllocation({
      ...common,
      baselineConnections: 0,
      realtimeWindowMs: 0,
    })).toMatchObject({ accepted: false, joinRatePerSecond: Number.POSITIVE_INFINITY });
  });

  it.each([
    ["projected connections", { baselineConnections: 51 }, "safe_projected_connection_ceiling"],
    ["connection limit", { connectionLimit: 501 }, "safe_connection_limit_ceiling"],
    ["connection headroom", { connectionHeadroom: 49 }, "safe_connection_headroom_floor"],
    ["join rate", { maxJoinRate: 101 }, "safe_join_rate_ceiling"],
    ["callback rate", { maxDeliveryCallbackRate: 401 }, "safe_delivery_callback_ceiling"],
    ["message limit", { messageLimit: 501 }, "safe_message_limit_ceiling"],
    ["message headroom", { messageHeadroom: 49 }, "safe_message_headroom_floor"],
  ])("requires explicit approval to bypass the %s ceiling", (_label, change, failure) => {
    expect(evaluateRealtimeAllocation({ ...safeAllocation, ...change }).failures).toContain(failure);
    const approval = evaluateRealtimeApproval(
      "I_ACKNOWLEDGE_APPROVED_QUOTA_SPEND_AND_PROJECT_CHANGE",
      "APPROVAL-123",
    );
    expect(evaluateRealtimeAllocation({
      ...safeAllocation,
      ...change,
      overrideAcknowledged: approval.acknowledged,
    }).failures).not.toContain(failure);
  });

  it("requires the exact approval token and an 8-200 character reference", () => {
    expect(evaluateRealtimeApproval("wrong", "APPROVAL-123").acknowledged).toBe(false);
    expect(evaluateRealtimeApproval(
      "I_ACKNOWLEDGE_APPROVED_QUOTA_SPEND_AND_PROJECT_CHANGE",
      "short",
    ).acknowledged).toBe(false);
    expect(evaluateRealtimeApproval(
      "I_ACKNOWLEDGE_APPROVED_QUOTA_SPEND_AND_PROJECT_CHANGE",
      "APPROVAL-123",
    )).toEqual({ acknowledged: true, reference: "APPROVAL-123" });
  });

  it("rejects a wave whose subscriber-weighted delivery rate exceeds its budget", () => {
    const estimate = estimateRealtimeWave({
      selectedActors: [{ boardId: "a" }, { boardId: "a" }, { boardId: "b" }],
      mutations: [
        { boardId: "a", delayMs: 0 },
        { boardId: "a", delayMs: 1 },
        { boardId: "b", delayMs: 2 },
      ],
      arrivalWindowMs: 10,
      maxDeliveryCallbackRate: 4,
      baselineMessageRate: 0,
      messageLimit: 500,
      messageHeadroom: 50,
    });
    expect(estimate).toMatchObject({
      accepted: false,
      deliveredMessages: 5,
      deliveryRollingPeak: 5,
      publishRollingPeak: 3,
    });
  });

  it("rejects an average-safe wave whose deterministic one-second cluster is unsafe", () => {
    const estimate = estimateRealtimeWave({
      selectedActors: [{ boardId: "a" }],
      mutations: [
        ...Array.from({ length: 401 }, (_, index) => ({ boardId: "a", delayMs: index })),
        ...Array.from({ length: 99 }, (_, index) => ({ boardId: "a", delayMs: 10_000 + index })),
      ],
      arrivalWindowMs: 30_000,
      maxDeliveryCallbackRate: 400,
      baselineMessageRate: 0,
      messageLimit: 1_000,
      messageHeadroom: 0,
    });
    expect(estimate.deliveredMessages / 30).toBeLessThan(400);
    expect(estimate).toMatchObject({ accepted: false, deliveryRollingPeak: 401 });
  });

  it("aggregates callbacks incrementally in constant work per callback", () => {
    const metrics = {
      total: 0,
      perEvent: {},
      perSecond: {},
      peakPerSecond: 0,
      rollingPeakPerSecond: 0,
    };
    expect(recordRealtimeCallback(metrics, "card_changed", 1_001)).toBe(1);
    expect(recordRealtimeCallback(metrics, "board_changed", 1_999)).toBe(2);
    expect(recordRealtimeCallback(metrics, "board_changed", 2_000)).toBe(3);
    expect(metrics).toEqual({
      total: 3,
      perEvent: { card_changed: 1, board_changed: 2 },
      perSecond: { "1": 2, "2": 1 },
      peakPerSecond: 2,
      rollingPeakPerSecond: 3,
    });
    expect(JSON.stringify(metrics)).not.toContain("rollingWindow");
  });

  it("counts callbacks in a rolling 1000ms window across wall-clock bucket boundaries", () => {
    const metrics = {
      total: 0,
      perEvent: {},
      perSecond: {},
      peakPerSecond: 0,
      rollingPeakPerSecond: 0,
    };
    expect(recordRealtimeCallback(metrics, "event", 999)).toBe(1);
    expect(recordRealtimeCallback(metrics, "event", 1_001)).toBe(2);
    expect(recordRealtimeCallback(metrics, "event", 1_999)).toBe(2);
    expect(metrics).toMatchObject({
      perSecond: { "0": 1, "1": 2 },
      peakPerSecond: 2,
      rollingPeakPerSecond: 2,
    });
  });

  it("rejects an average-safe deterministic join schedule with an unsafe rolling peak", () => {
    const delays = [
      ...Array.from({ length: 101 }, (_, index) => index),
      ...Array.from({ length: 99 }, (_, index) => 10_000 + index),
    ];
    expect(delays.length / 20).toBeLessThanOrEqual(100);
    expect(estimateRealtimeJoinSchedule(delays, 100)).toEqual({
      accepted: false,
      scheduledJoins: 200,
      rollingPeakPerSecond: 101,
      maxJoinRate: 100,
    });
  });

  it("paces actual join starts without catch-up bursts after event-loop delay", () => {
    expect(nextRealtimeJoinStartAt(null, 100, 100)).toEqual({
      minimumIntervalMs: 10,
      startAtMs: 100,
    });
    expect(nextRealtimeJoinStartAt(100, 105, 100).startAtMs).toBe(110);
    expect(nextRealtimeJoinStartAt(110, 5_000, 100).startAtMs).toBe(5_000);
    expect(nextRealtimeJoinStartAt(5_000, 5_000, 100).startAtMs).toBe(5_010);
  });

  it("summarizes actual join timestamps and rejects a rolling rate excess", () => {
    const safe = Array.from({ length: 101 }, (_, index) => index * 10);
    expect(summarizeRealtimeJoinStarts(safe, 100)).toMatchObject({
      accepted: true,
      startedJoins: 101,
      rollingPeakPerSecond: 100,
      minimumIntervalMs: 10,
    });
    const unsafe = [...Array.from({ length: 100 }, (_, index) => index * 10), 999];
    expect(summarizeRealtimeJoinStarts(unsafe, 100)).toMatchObject({
      accepted: false,
      rollingPeakPerSecond: 101,
    });
  });

  it("releases abort-aware scheduled waits immediately", async () => {
    const delay = createAbortAwareDelay();
    const started = Date.now();
    const waiting = delay.wait(5_000);
    delay.abort();
    await expect(waiting).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
    await expect(delay.wait(5_000)).resolves.toBe(false);
  });

  it("selects realtime actors round-robin across classrooms", () => {
    const actors = Array.from({ length: 3 }, (_, classIndex) =>
      Array.from({ length: 3 }, (__, studentIndex) => ({
        boardId: `board-${classIndex}`,
        classIndex,
        studentIndex,
      })),
    ).flat();
    expect(selectRealtimeActorsRoundRobin(actors, 5).map((actor) => [
      actor.studentIndex,
      actor.classIndex,
    ])).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]]);
  });

  it("writes unsafe allocation evidence without connecting to the database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "aura-loadtest-"));
    const resultPath = path.join(directory, "result.json");
    try {
      const exitCode = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["scripts/loadtest-classroom-concurrency.mjs"], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            LOADTEST_ALLOW_DATABASE_WRITE: "1",
            AUTH_SECRET: "test-only-secret",
            DATABASE_URL: "postgresql://invalid.invalid:1/no-access",
            LOADTEST_CLASSROOMS: "1",
            LOADTEST_STUDENTS_PER_CLASS: "1",
            LOADTEST_REALTIME_CLIENTS: "2",
            LOADTEST_REALTIME_BASELINE_CONNECTIONS: "0",
            LOADTEST_REALTIME_BASELINE_MESSAGE_RATE: "0",
            LOADTEST_RESULT: resultPath,
          },
          stdio: "ignore",
        });
        child.once("error", reject);
        child.once("exit", resolve);
      });
      expect(exitCode).toBe(1);
      const evidence = JSON.parse(await readFile(resultPath, "utf8"));
      expect(evidence.schema).toBe("aura-board/classroom-loadtest/v2");
      expect(evidence.config.realtimeAllocation.failures).toContain(
        "realtime_clients_exceed_students",
      );
      expect(evidence.seed).toBeNull();
      expect(evidence.cleanup).toEqual({ skipped: true });
      expect(evidence.fatal.message).toContain("Unsafe Realtime allocation");
      expect(evidence.gate).toMatchObject({
        passed: false,
        failures: ["fatal"],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("counts realtime expectations only for successful mutations per board", () => {
    const actors = [
      { boardId: "board-a" },
      { boardId: "board-a" },
      { boardId: "board-b" },
    ];
    const rows = [
      { op: "card.create", boardId: "board-a", ok: true },
      { op: "card.create", boardId: "board-a", ok: false },
      { op: "comment.create", boardId: "board-a", ok: true },
      { op: "comment.create", boardId: "board-b", ok: false },
      { op: "like.create", boardId: "board-b", ok: true },
    ];

    expect(expectedRealtimeMessageCounts(actors, rows, 3)).toEqual({
      card_changed: 2,
      board_changed: 3,
    });
  });

  it("accepts only literal true or object metadata without core row overrides", () => {
    for (const invalid of [undefined, null, false, 0, "", []]) {
      expect(parseRequestValidation(invalid)).toEqual({ ok: false, metadata: {} });
    }
    expect(parseRequestValidation(true)).toEqual({ ok: true, metadata: {} });
    expect(parseRequestValidation({
      boardId: "board-a",
      op: "forged",
      status: 599,
      ok: false,
      errorCode: "forged",
      ms: -1,
    })).toEqual({ ok: true, metadata: { boardId: "board-a" } });
  });

  it("requires both done outbox rows and matching reward transactions", () => {
    const now = Date.parse("2026-08-10T00:00:10Z");
    const done = [{ sourceId: "comment-1", status: "done", createdAt: now }];
    const transaction = [{ sourceRef: "comment-1" }];

    expect(summarizeCommentRewardSettlement(["comment-1"], done, [], now).complete).toBe(false);
    expect(summarizeCommentRewardSettlement(["comment-1"], [], transaction, now).complete).toBe(false);
    expect(summarizeCommentRewardSettlement(["comment-1"], done, transaction, now).complete).toBe(true);
  });

  it("reports dead and outstanding reward deliveries from exact comment IDs", () => {
    const summary = summarizeCommentRewardSettlement(
      ["comment-1", "comment-2"],
      [
        { sourceId: "comment-1", status: "done", createdAt: "2026-08-10T00:00:00Z" },
        { sourceId: "comment-2", status: "dead", createdAt: "2026-08-10T00:00:05Z" },
        { sourceId: "foreign", status: "dead", createdAt: "2020-01-01T00:00:00Z" },
      ],
      [{ sourceRef: "comment-1" }, { sourceRef: "foreign" }],
      Date.parse("2026-08-10T00:00:10Z"),
    );

    expect(summary).toEqual({
      expected: 2,
      outboxStatusCounts: { done: 1, dead: 1 },
      completedTransactionCount: 1,
      complete: false,
      dead: true,
      oldestOutstandingAgeMs: 5_000,
    });
  });

  it("builds narrowly keyed cleanup sources and treats zero comments as settled", () => {
    expect(summarizeCommentRewardSettlement([], [], [], Date.now()).complete).toBe(true);
    expect(exactSyntheticOutboxSources({
      commentIds: ["comment-1"],
      likeIds: ["like-1"],
      transactionIds: ["transaction-1"],
    })).toEqual([
      { eventType: "card_comment", sourceId: "comment-1" },
      { eventType: "comment_reward", sourceId: "comment-1" },
      { eventType: "card_like", sourceId: "like-1" },
      { eventType: "transaction", sourceId: "transaction-1" },
    ]);
  });
});
