export function expectedRealtimeMessageCounts(actors, mutationRows, realtimeClients) {
  const subscribersByBoard = new Map();
  for (const actor of actors.slice(0, realtimeClients)) {
    subscribersByBoard.set(actor.boardId, (subscribersByBoard.get(actor.boardId) ?? 0) + 1);
  }

  const expected = { card_changed: 0, board_changed: 0 };
  for (const row of mutationRows) {
    if (!row.ok || typeof row.boardId !== "string") continue;
    const subscribers = subscribersByBoard.get(row.boardId) ?? 0;
    if (row.op === "card.create") expected.card_changed += subscribers;
    if (row.op === "comment.create" || row.op === "like.create") {
      expected.board_changed += subscribers;
    }
  }
  return expected;
}

export function evaluateRealtimeApproval(token, rawReference) {
  const reference = typeof rawReference === "string" ? rawReference.trim() : "";
  return {
    acknowledged:
      token === "I_ACKNOWLEDGE_APPROVED_QUOTA_SPEND_AND_PROJECT_CHANGE" &&
      reference.length >= 8 &&
      reference.length <= 200,
    reference,
  };
}

export function evaluateRealtimeAllocation({
  totalStudents,
  realtimeClients,
  baselineConnections,
  connectionLimit,
  connectionHeadroom,
  realtimeWindowMs,
  maxJoinRate,
  messageLimit,
  messageHeadroom,
  baselineMessageRate,
  maxDeliveryCallbackRate,
  overrideAcknowledged = false,
}) {
  const availableConnections = connectionLimit - connectionHeadroom - (baselineConnections ?? 0);
  const projectedConnections = (baselineConnections ?? 0) + realtimeClients;
  const joinRatePerSecond = realtimeClients === 0
    ? 0
    : realtimeWindowMs > 0
      ? realtimeClients / (realtimeWindowMs / 1_000)
      : Number.POSITIVE_INFINITY;
  const failures = [];
  if (realtimeClients > totalStudents) failures.push("realtime_clients_exceed_students");
  if (realtimeClients > 0 && baselineConnections === null) {
    failures.push("realtime_baseline_required");
  }
  if (realtimeClients > 0 && baselineMessageRate === null) {
    failures.push("realtime_message_baseline_required");
  }
  if (availableConnections < 0 || realtimeClients > availableConnections) {
    failures.push("realtime_connection_allocation");
  }
  if (joinRatePerSecond > maxJoinRate) failures.push("realtime_join_rate");
  if (!overrideAcknowledged) {
    if (projectedConnections > 450) failures.push("safe_projected_connection_ceiling");
    if (connectionLimit > 500) failures.push("safe_connection_limit_ceiling");
    if (connectionHeadroom < 50) failures.push("safe_connection_headroom_floor");
    if (maxJoinRate > 100) failures.push("safe_join_rate_ceiling");
    if (maxDeliveryCallbackRate > 400) failures.push("safe_delivery_callback_ceiling");
    if (messageLimit > 500) failures.push("safe_message_limit_ceiling");
    if (messageHeadroom < 50) failures.push("safe_message_headroom_floor");
  }
  return {
    accepted: failures.length === 0,
    failures,
    availableConnections,
    projectedConnections,
    joinRatePerSecond,
  };
}

export function selectRealtimeActorsRoundRobin(actors, realtimeClients) {
  return [...actors]
    .sort((left, right) =>
      Number(left.studentIndex) - Number(right.studentIndex) ||
      Number(left.classIndex) - Number(right.classIndex),
    )
    .slice(0, realtimeClients);
}

export function rollingPeak(events) {
  const sorted = [...events].sort((left, right) => left.delayMs - right.delayMs);
  let start = 0;
  let current = 0;
  let peak = 0;
  for (let end = 0; end < sorted.length; end += 1) {
    current += sorted[end].weight;
    while (sorted[end].delayMs - sorted[start].delayMs >= 1_000) {
      current -= sorted[start].weight;
      start += 1;
    }
    peak = Math.max(peak, current);
  }
  return peak;
}

export function estimateRealtimeJoinSchedule(delaysMs, maxJoinRate) {
  const rollingPeakPerSecond = rollingPeak(
    delaysMs.map((delayMs) => ({ delayMs, weight: 1 })),
  );
  return {
    accepted: rollingPeakPerSecond <= maxJoinRate,
    scheduledJoins: delaysMs.length,
    rollingPeakPerSecond,
    maxJoinRate,
  };
}

export function nextRealtimeJoinStartAt(lastStartedAtMs, nowMs, maxJoinRate) {
  const minimumIntervalMs = Math.ceil(1_000 / maxJoinRate);
  return {
    minimumIntervalMs,
    startAtMs:
      lastStartedAtMs === null
        ? nowMs
        : Math.max(nowMs, lastStartedAtMs + minimumIntervalMs),
  };
}

export function summarizeRealtimeJoinStarts(startedAtMs, maxJoinRate) {
  const rollingPeakPerSecond = rollingPeak(
    startedAtMs.map((delayMs) => ({ delayMs, weight: 1 })),
  );
  const perSecond = {};
  for (const timestamp of startedAtMs) {
    const bucket = String(Math.floor(timestamp / 1_000));
    perSecond[bucket] = (perSecond[bucket] ?? 0) + 1;
  }
  return {
    accepted: rollingPeakPerSecond <= maxJoinRate,
    startedJoins: startedAtMs.length,
    rollingPeakPerSecond,
    maxJoinRate,
    minimumIntervalMs: Math.ceil(1_000 / maxJoinRate),
    perSecond,
    startedAtMs: [...startedAtMs],
  };
}

export function createAbortAwareDelay() {
  let aborted = false;
  const pending = new Set();
  return {
    wait(ms) {
      if (aborted || ms <= 0) return Promise.resolve(!aborted);
      return new Promise((resolve) => {
        const entry = {
          timer: setTimeout(() => {
            pending.delete(entry);
            resolve(true);
          }, ms),
          resolve,
        };
        pending.add(entry);
      });
    },
    abort() {
      if (aborted) return;
      aborted = true;
      for (const entry of pending) {
        clearTimeout(entry.timer);
        entry.resolve(false);
      }
      pending.clear();
    },
    get aborted() {
      return aborted;
    },
  };
}

export function estimateRealtimeWave({
  selectedActors,
  mutations,
  arrivalWindowMs,
  maxDeliveryCallbackRate,
  baselineMessageRate,
  messageLimit,
  messageHeadroom,
}) {
  const subscribersByBoard = new Map();
  for (const actor of selectedActors) {
    subscribersByBoard.set(actor.boardId, (subscribersByBoard.get(actor.boardId) ?? 0) + 1);
  }
  const deliveryEvents = mutations.map((mutation) => ({
    delayMs: mutation.delayMs,
    weight: subscribersByBoard.get(mutation.boardId) ?? 0,
  }));
  const publishEvents = mutations.map((mutation) => ({ delayMs: mutation.delayMs, weight: 1 }));
  const deliveredMessages = deliveryEvents.reduce((sum, event) => sum + event.weight, 0);
  const deliveryRollingPeak = rollingPeak(deliveryEvents);
  const publishRollingPeak = rollingPeak(publishEvents);
  const projectedMessageRollingPeak =
    deliveryRollingPeak + publishRollingPeak + baselineMessageRate;
  const availableMessageRate = messageLimit - messageHeadroom;
  const failures = [];
  if (deliveryRollingPeak > maxDeliveryCallbackRate) failures.push("delivery_callback_peak");
  if (projectedMessageRollingPeak > availableMessageRate) failures.push("project_message_peak");
  return {
    accepted: failures.length === 0,
    failures,
    mutationCount: mutations.length,
    deliveredMessages,
    arrivalWindowMs,
    deliveryRollingPeak,
    publishRollingPeak,
    baselineMessageRate,
    projectedMessageRollingPeak,
    availableMessageRate,
    subscribersByBoard: Object.fromEntries(subscribersByBoard),
  };
}

export function recordRealtimeCallback(metrics, event, atMs) {
  metrics.total += 1;
  metrics.perEvent[event] = (metrics.perEvent[event] ?? 0) + 1;
  const bucket = String(Math.floor(atMs / 1_000));
  metrics.perSecond[bucket] = (metrics.perSecond[bucket] ?? 0) + 1;
  metrics.peakPerSecond = Math.max(metrics.peakPerSecond, metrics.perSecond[bucket]);
  if (!metrics._rollingWindow) {
    Object.defineProperty(metrics, "_rollingWindow", {
      value: { timestamps: [], start: 0 },
      enumerable: false,
    });
  }
  const rollingWindow = metrics._rollingWindow;
  rollingWindow.timestamps.push(atMs);
  while (
    rollingWindow.start < rollingWindow.timestamps.length &&
    atMs - rollingWindow.timestamps[rollingWindow.start] >= 1_000
  ) {
    rollingWindow.start += 1;
  }
  const rollingCount = rollingWindow.timestamps.length - rollingWindow.start;
  metrics.rollingPeakPerSecond = Math.max(metrics.rollingPeakPerSecond ?? 0, rollingCount);
  if (
    rollingWindow.start > 1_024 &&
    rollingWindow.start * 2 > rollingWindow.timestamps.length
  ) {
    rollingWindow.timestamps.splice(0, rollingWindow.start);
    rollingWindow.start = 0;
  }
  return rollingCount;
}

const CORE_REQUEST_ROW_FIELDS = new Set(["op", "status", "ok", "errorCode", "ms"]);

export function parseRequestValidation(validation) {
  if (validation === true) return { ok: true, metadata: {} };
  if (
    validation === null ||
    typeof validation !== "object" ||
    Array.isArray(validation)
  ) {
    return { ok: false, metadata: {} };
  }
  return {
    ok: true,
    metadata: Object.fromEntries(
      Object.entries(validation).filter(([key]) => !CORE_REQUEST_ROW_FIELDS.has(key)),
    ),
  };
}

export function summarizeCommentRewardSettlement(commentIds, outboxRows, transactionRows, nowMs) {
  const expectedIds = new Set(commentIds);
  const statusCounts = {};
  let oldestOutstandingAt = null;
  for (const row of outboxRows) {
    if (!expectedIds.has(row.sourceId)) continue;
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (row.status !== "done") {
      const createdAt = new Date(row.createdAt).getTime();
      if (Number.isFinite(createdAt)) {
        oldestOutstandingAt = oldestOutstandingAt === null
          ? createdAt
          : Math.min(oldestOutstandingAt, createdAt);
      }
    }
  }

  const completedTransactionCount = new Set(
    transactionRows
      .map((row) => row.sourceRef)
      .filter((sourceRef) => expectedIds.has(sourceRef)),
  ).size;
  const expected = expectedIds.size;
  const completedOutboxCount = statusCounts.done ?? 0;
  const deadCount = statusCounts.dead ?? 0;
  return {
    expected,
    outboxStatusCounts: statusCounts,
    completedTransactionCount,
    complete:
      expected === 0 ||
      (deadCount === 0 &&
        completedOutboxCount === expected &&
        completedTransactionCount === expected),
    dead: deadCount > 0,
    oldestOutstandingAgeMs:
      oldestOutstandingAt === null ? null : Math.max(0, nowMs - oldestOutstandingAt),
  };
}

export function exactSyntheticOutboxSources({ commentIds, likeIds, transactionIds }) {
  return [
    ...commentIds.flatMap((sourceId) => [
      { eventType: "card_comment", sourceId },
      { eventType: "comment_reward", sourceId },
    ]),
    ...likeIds.map((sourceId) => ({ eventType: "card_like", sourceId })),
    ...transactionIds.map((sourceId) => ({ eventType: "transaction", sourceId })),
  ];
}
