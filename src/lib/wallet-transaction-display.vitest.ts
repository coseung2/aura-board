import { describe, expect, it } from "vitest";
import {
  getWalletTransactionDisplay,
  walletTransactionNoteLabel,
  walletTransactionTypeLabel,
} from "./wallet-transaction-display";

describe("wallet transaction display", () => {
  it("never exposes an unknown transaction code as the type label", () => {
    expect(walletTransactionTypeLabel("creature_egg_purchase")).toBe("펫 알 구매");
    expect(walletTransactionTypeLabel("future_machine_code")).toBe("거래");
  });

  it("localizes machine-created purchase notes", () => {
    expect(walletTransactionNoteLabel({
      type: "creature_item_purchase",
      note: "creature-item-purchase:fruit-snack:2",
      sourceType: "creature_item_purchase",
    })).toBe("펫 아이템 구매");
    expect(walletTransactionNoteLabel({
      type: "slime_item_refund",
      note: "slime-item-refund:water-puddle-background",
      sourceType: "slime_item_refund",
    })).toBe("슬라임 아이템 환불");
  });

  it("removes internal reward identifiers while retaining useful Korean detail", () => {
    expect(walletTransactionNoteLabel({
      type: "deposit",
      note: "주간 걷기 25,000보 달성 보상 (tier1) [2026-07-27]",
      sourceType: "walking_weekly_reward",
    })).toBe("주간 걷기 25,000보 달성 보상");
    expect(walletTransactionNoteLabel({
      type: "deposit",
      note: "comment_reward reward [comment:abc123]",
      sourceType: "comment_reward",
    })).toBe("댓글 작성 보상");
  });

  it("preserves teacher-authored notes for ordinary bank transactions", () => {
    expect(getWalletTransactionDisplay({
      type: "withdraw",
      note: "현장 체험학습 준비물",
      sourceType: null,
    })).toEqual({ typeLabel: "출금", noteLabel: "현장 체험학습 준비물" });
  });
});
