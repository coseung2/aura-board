import { describe, expect, it } from "vitest";
import { parseGameMetrics } from "./metrics";
import {
  decodeGameRecordCursor,
  encodeGameRecordCursor,
  gameRecordWhere,
  rangeStart,
} from "./records";

describe("game record helpers", () => {
  it("round-trips a deterministic tie-break cursor", () => {
    const encoded = encodeGameRecordCursor({
      completedAt: "2026-08-02T00:00:00.000Z",
      id: "result-9",
    });
    expect(decodeGameRecordCursor(encoded)).toEqual({
      completedAt: "2026-08-02T00:00:00.000Z",
      id: "result-9",
    });
    expect(decodeGameRecordCursor("broken")).toBeNull();
  });

  it("always scopes the query to the authenticated student", () => {
    const where = gameRecordWhere({
      studentId: "student-self",
      kind: "omok",
      range: "all",
      cursor: {
        completedAt: "2026-08-02T00:00:00.000Z",
        id: "result-9",
      },
    });
    expect(where).toMatchObject({
      studentId: "student-self",
      gameKind: "omok",
      AND: [
        {
          OR: [
            { completedAt: { lt: new Date("2026-08-02T00:00:00.000Z") } },
            {
              completedAt: new Date("2026-08-02T00:00:00.000Z"),
              id: { lt: "result-9" },
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(where)).not.toContain("student-other");
  });

  it("uses inclusive UTC cutoffs for supported ranges", () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    expect(rangeStart("7d", now)?.toISOString()).toBe("2026-07-26T12:00:00.000Z");
    expect(rangeStart("all", now)).toBeNull();
  });

  it("rejects malformed or cross-game metrics", () => {
    expect(() =>
      parseGameMetrics("omok", {
        side: "black",
        moveCount: 21,
        reason: "five",
        leakedAnswer: "nope",
      }),
    ).toThrow();
    expect(() =>
      parseGameMetrics("song-guess", {
        rank: 1,
        correctRounds: 3,
        totalRounds: 5,
        bestTierMs: -1,
        reason: "completed",
      }),
    ).toThrow();
  });
});
