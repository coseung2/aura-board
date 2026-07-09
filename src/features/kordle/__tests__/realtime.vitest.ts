import { describe, expect, it } from "vitest";
import { kordleBoardChannelKey, kordleCorrectCount } from "../realtime";

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
});
