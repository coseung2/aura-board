import { describe, expect, it } from "vitest";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";

const snapshot = {
  roundIndex: 1,
  rounds: [
    { keyword: "past", guesserSlot: 1 },
    { keyword: "active", guesserSlot: 2 },
    { keyword: "future", guesserSlot: 1 },
  ],
  groups: [{ studentIds: ["student-a", "student-b"] }],
};

describe("sanitizeGameSnapshotForStudent", () => {
  it("shows the active word to explainers but never future words", () => {
    const result = sanitizeGameSnapshotForStudent(snapshot, "student-a");
    expect(result.rounds.map((round) => round.keyword)).toEqual([
      "past",
      "active",
      "",
    ]);
  });

  it("hides the active word from the current guesser", () => {
    const result = sanitizeGameSnapshotForStudent(snapshot, "student-b");
    expect(result.rounds.map((round) => round.keyword)).toEqual([
      "past",
      "",
      "",
    ]);
  });
});
