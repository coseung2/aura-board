import { describe, expect, it } from "vitest";

import { nextCardOrder } from "../../../apps/mobile/components/layouts/cards-board-utils";
import type { BoardCard } from "../../../apps/mobile/lib/types";

function card(order: number, sectionId: string | null = null): BoardCard {
  return { id: `${sectionId ?? "root"}-${order}`, order, sectionId } as BoardCard;
}

describe("mobile card ordering", () => {
  it("appends a general card after the highest server order", () => {
    expect(nextCardOrder([card(0), card(4), card(2)])).toBe(5);
  });

  it("calculates the next order within the selected column", () => {
    expect(
      nextCardOrder(
        [card(7, "other"), card(1, "target"), card(3, "target")],
        "target",
      ),
    ).toBe(4);
  });
});
