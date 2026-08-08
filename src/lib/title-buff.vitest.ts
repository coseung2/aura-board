import { describe, expect, it, vi } from "vitest";

import { loadEquippedRewardBuffBps } from "./reward-service";

function fakeTx(
  slimes: Array<{ color: string; isEquipped: boolean; growthStage: number; equippedTitleKey: string | null }>,
) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        slimes: slimes
          .filter((slime) => slime.isEquipped)
          .map(({ color, growthStage, equippedTitleKey }) => ({
            color,
            growthStage,
            equippedTitleKey,
          })),
        item_keys: [],
        has_active_creature: false,
      },
    ]),
  } as never;
}

describe("equipped title buffs", () => {
  it("adds each equipped title on top of the pet's own buff", async () => {
    // Green is the reading pet at +2%; the worn title adds another +2%.
    const bps = await loadEquippedRewardBuffBps(
      fakeTx([
        { color: "green", isEquipped: true, growthStage: 1, equippedTitleKey: "reflection-300" },
      ]),
      "student-1",
      "reading",
      Number.MAX_SAFE_INTEGER,
    );

    expect(bps).toBe(400);
  });

  it("counts the same title once per wearing pet", async () => {
    const bps = await loadEquippedRewardBuffBps(
      fakeTx([
        { color: "green", isEquipped: true, growthStage: 1, equippedTitleKey: "reflection-300" },
        { color: "blue", isEquipped: true, growthStage: 1, equippedTitleKey: "reflection-300" },
      ]),
      "student-1",
      "reading",
      Number.MAX_SAFE_INTEGER,
    );

    // Green's own +2% plus two worn titles at +2% each.
    expect(bps).toBe(600);
  });

  it("ignores titles whose effect belongs to another activity", async () => {
    const bps = await loadEquippedRewardBuffBps(
      fakeTx([
        { color: "green", isEquipped: true, growthStage: 1, equippedTitleKey: "daily-20k" },
      ]),
      "student-1",
      "reading",
      Number.MAX_SAFE_INTEGER,
    );

    expect(bps).toBe(200);
  });

  it("ignores an unequipped pet's base and title buffs", async () => {
    const bps = await loadEquippedRewardBuffBps(
      fakeTx([
        { color: "green", isEquipped: false, growthStage: 3, equippedTitleKey: "logs-50" },
      ]),
      "student-1",
      "reading",
      Number.MAX_SAFE_INTEGER,
    );

    expect(bps).toBe(0);
  });

  it("stacks equipped pet buffs while excluding an unequipped pet", async () => {
    const bps = await loadEquippedRewardBuffBps(
      fakeTx([
        { color: "green", isEquipped: true, growthStage: 1, equippedTitleKey: "reflection-300" },
        { color: "green", isEquipped: false, growthStage: 3, equippedTitleKey: "logs-50" },
      ]),
      "student-1",
      "reading",
      Number.MAX_SAFE_INTEGER,
    );

    // The equipped pet contributes +2% base and +2% title; the other pet is ignored.
    expect(bps).toBe(400);
  });

  it("sums past the retired 20 percent ceiling", async () => {
    const bps = await loadEquippedRewardBuffBps(
      fakeTx([
        { color: "green", isEquipped: true, growthStage: 3, equippedTitleKey: "logs-50" },
      ]),
      "student-1",
      "reading",
      Number.MAX_SAFE_INTEGER,
    );

    // Stage-three green is +8%, and 독서왕 adds +4%.
    expect(bps).toBe(1_200);
  });
});
