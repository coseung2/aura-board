import { describe, expect, it } from "vitest";
import {
  kordleBoardChannelKey,
  kordleCorrectCount,
  kordleParticipantsFromPresenceState,
} from "../realtime";

describe("kordle realtime helpers", () => {
  it("builds the board-scoped channel key", () => {
    expect(kordleBoardChannelKey("board_123")).toBe("kordle:board:board_123");
  });

  it("counts correct feedback letters", () => {
    expect(
      kordleCorrectCount([
        { char: "A", state: "correct" },
        { char: "B", state: "present" },
        { char: "C", state: "correct" },
      ]),
    ).toBe(2);
  });

  it("treats malformed feedback as zero correct letters", () => {
    expect(kordleCorrectCount(null)).toBe(0);
    expect(kordleCorrectCount({ state: "correct" })).toBe(0);
  });

  it("dedupes presence participants by student and keeps first join time", () => {
    expect(
      kordleParticipantsFromPresenceState({
        a: [
          { studentId: "s2", name: "Mina", joinedAt: "2026-07-09T00:00:03.000Z" },
          { studentId: "s1", name: "Joon", joinedAt: "2026-07-09T00:00:02.000Z" },
        ],
        b: [
          { studentId: "s1", name: "Joon", joinedAt: "2026-07-09T00:00:01.000Z" },
          { studentId: "", name: "Nope", joinedAt: "2026-07-09T00:00:00.000Z" },
        ],
      }),
    ).toEqual([
      { studentId: "s1", name: "Joon", joinedAt: "2026-07-09T00:00:01.000Z" },
      { studentId: "s2", name: "Mina", joinedAt: "2026-07-09T00:00:03.000Z" },
    ]);
  });
});
