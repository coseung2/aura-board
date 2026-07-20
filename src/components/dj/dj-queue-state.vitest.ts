import { describe, expect, it } from "vitest";
import type { CardData } from "../DraggableCard";
import {
  deriveDJQueueState,
  mergeDJQueueSnapshot,
  resolveDJQueueAuthorName,
} from "./dj-queue-state";

const card = (overrides: Partial<CardData> = {}): CardData => ({
  id: "queue-card",
  title: "신청곡",
  content: "",
  color: null,
  x: 0,
  y: 0,
  width: 240,
  height: 160,
  order: 1,
  authorId: null,
  ...overrides,
});

describe("resolveDJQueueAuthorName", () => {
  it("masks the author on anonymous boards", () => {
    expect(
      resolveDJQueueAuthorName(
        card({ studentAuthorName: "민지", anonymousAuthor: true }),
      ),
    ).toBe("익명");
  });

  it("keeps the same fallback order as the queue API", () => {
    expect(
      resolveDJQueueAuthorName(
        card({ externalAuthorName: "게스트", studentAuthorName: "민지" }),
      ),
    ).toBe("게스트");
  });

  it("does not resurrect a card while its optimistic delete is pending", () => {
    const incoming = [card({ id: "deleted", queueStatus: "pending" })];

    expect(
      mergeDJQueueSnapshot(incoming, [], new Set(["deleted"])),
    ).toEqual([]);
  });

  it("keeps an optimistic status until the mutation settles", () => {
    const incoming = [card({ id: "song", queueStatus: "pending" })];
    const optimistic = card({ id: "song", queueStatus: "approved" });

    expect(
      mergeDJQueueSnapshot(incoming, [optimistic], new Set(["song"])),
    ).toEqual([optimistic]);
  });

  it("keeps rejected items out of a student queue and removes now playing from up next", () => {
    const cards = [
      card({ id: "pending", queueStatus: "pending", order: 2 }),
      card({ id: "approved", queueStatus: "approved", order: 1 }),
      card({ id: "rejected", queueStatus: "rejected", order: 3 }),
      card({ id: "played", queueStatus: "played", order: 4 }),
    ];

    const studentState = deriveDJQueueState(cards, false);
    expect(studentState.nowPlaying?.id).toBe("approved");
    expect(studentState.upNext.map((item) => item.id)).toEqual(["pending"]);
    expect(studentState.playedCards.map((item) => item.id)).toEqual(["played"]);
    expect(deriveDJQueueState(cards, true).upNext.map((item) => item.id)).toEqual([
      "pending",
      "rejected",
    ]);
  });
});
