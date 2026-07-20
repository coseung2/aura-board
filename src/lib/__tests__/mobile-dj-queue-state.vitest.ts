import { describe, expect, it } from "vitest";

import {
  deriveQueueState,
  mergeQueueSnapshot,
} from "../../../apps/mobile/components/layouts/dj-queue-state";
import type { BoardCard } from "../../../apps/mobile/lib/types";

function card(id: string, queueStatus: BoardCard["queueStatus"]): BoardCard {
  return { id, queueStatus, order: 0 } as BoardCard;
}

describe("mobile DJ queue snapshot merge", () => {
  it("does not resurrect a card while its optimistic delete is pending", () => {
    const incoming = [card("deleted", "pending")];

    expect(mergeQueueSnapshot(incoming, [], new Set(["deleted"]))).toEqual([]);
  });

  it("keeps an optimistic status until the mutation settles", () => {
    const incoming = [card("song", "pending")];
    const optimistic = card("song", "approved");

    expect(
      mergeQueueSnapshot(incoming, [optimistic], new Set(["song"])),
    ).toEqual([optimistic]);
  });
});

describe("mobile DJ queue privacy", () => {
  it("does not derive a submitter ranking for an anonymous board", () => {
    const anonymousCard = {
      ...card("song", "played"),
      anonymousAuthor: true,
      externalAuthorName: "학생 이름",
    } as BoardCard;

    expect(deriveQueueState([anonymousCard], false, 10, true).ranking).toEqual(
      [],
    );
  });
});
