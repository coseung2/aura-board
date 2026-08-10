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
