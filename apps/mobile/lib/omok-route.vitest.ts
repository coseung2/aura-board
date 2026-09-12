import { describe, expect, it } from "vitest";
import { isActiveOmokRoute } from "./omok-route";

describe("active omok route", () => {
  it("hides global navigation on a live match board", () => {
    expect(isActiveOmokRoute("/board/omok-match-abc123")).toBe(true);
    expect(isActiveOmokRoute("/(student)/board/omok-match-abc123")).toBe(true);
    expect(isActiveOmokRoute("/board/omok-match-abc123?layout=omok")).toBe(true);
  });

  it("keeps navigation on lobby, hub and unrelated boards", () => {
    expect(isActiveOmokRoute("/board/game-hub-omok-classroom")).toBe(false);
    expect(isActiveOmokRoute("/(student)/boards?filter=play")).toBe(false);
    expect(isActiveOmokRoute("/board/reading-week")).toBe(false);
    expect(isActiveOmokRoute("/(student)/index")).toBe(false);
  });

  it("keeps navigation on nested input routes under a match board", () => {
    expect(isActiveOmokRoute("/board/omok-match-abc123/compose")).toBe(false);
    expect(isActiveOmokRoute("/board/omok-match-abc123/comments")).toBe(false);
  });

  it("handles an encoded slug and a missing slug", () => {
    expect(isActiveOmokRoute("/board/omok-match-a%20b")).toBe(true);
    expect(isActiveOmokRoute("/board")).toBe(false);
    expect(isActiveOmokRoute("/board/")).toBe(false);
  });
});
