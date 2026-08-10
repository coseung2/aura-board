import { describe, expect, it } from "vitest";

import {
  exactSyntheticOutboxSources,
  expectedRealtimeMessageCounts,
  parseRequestValidation,
  summarizeCommentRewardSettlement,
} from "./loadtest-classroom-metrics.mjs";

describe("classroom load-test metrics", () => {
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
