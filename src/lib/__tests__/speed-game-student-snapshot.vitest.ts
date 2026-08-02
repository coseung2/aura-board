import { describe, expect, it } from "vitest";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";

const snapshot = {
  status: "active",
  roundIndex: 1,
  rounds: [
    { id: "round-0", order: 0, keyword: "past", guesserSlot: 1 },
    { id: "round-1", order: 1, keyword: "active", guesserSlot: 2 },
    { id: "round-2", order: 2, keyword: "future", guesserSlot: 1 },
  ],
  groups: [{ id: "group-a", studentIds: ["student-a", "student-b"] }],
  answers: [],
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
