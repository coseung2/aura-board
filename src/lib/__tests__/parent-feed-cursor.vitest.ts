import { describe, expect, it } from "vitest";
import {
  decodeParentFeedCursor,
  encodeParentFeedCursor,
} from "../parent-feed-cursor";

describe("parent feed cursor", () => {
  it("round-trips the keyset fields", () => {
    const createdAt = new Date("2026-07-10T03:04:05.678Z");
    const cursor = encodeParentFeedCursor({ createdAt, id: "card_123" });

    expect(cursor).not.toContain("{");
    expect(decodeParentFeedCursor(cursor)).toEqual({
      createdAt,
      id: "card_123",
    });
  });

  it.each([
    "",
    "not+base64url",
    Buffer.from("not json", "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ v: 2, c: "2026-07-10T03:04:05.678Z", i: "card_1" }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, c: "not-a-date", i: "card_1" }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, c: "2026-07-10", i: "card_1" }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, c: "2026-07-10T03:04:05.678Z", i: "" }), "utf8").toString("base64url"),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(decodeParentFeedCursor(cursor)).toBeNull();
  });
});
