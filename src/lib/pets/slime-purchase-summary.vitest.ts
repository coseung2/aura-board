import { describe, expect, it } from "vitest";

import { calculateSlimePurchaseBalanceSummary } from "./slime-purchase-summary";

describe("slime purchase balance summary", () => {
  it("normalizes quantity and reports the post-purchase balance", () => {
    expect(calculateSlimePurchaseBalanceSummary(700, 2, 2_000)).toEqual({
      unitPrice: 700,
      quantity: 2,
      total: 1_400,
      currentBalance: 2_000,
      remainingBalance: 600,
      shortOnFunds: false,
    });
  });
});
