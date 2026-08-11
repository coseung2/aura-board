import { describe, expect, it } from "vitest";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  feedPostInputSchema,
  getYoutubeVideoId,
  normalizeFeedMedia,
} from "./validation";

describe("feed validation", () => {
  it("accepts a media-only post", () => {
    const parsed = feedPostInputSchema.safeParse({
      media: [
        {
          kind: "IMAGE",
          url: "https://example.com/card.png",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an empty post", () => {
    const parsed = feedPostInputSchema.safeParse({ title: " ", body: " ", media: [] });
    expect(parsed.success).toBe(false);
  });

  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts a supported YouTube video id from %s", (value, expected) => {
    expect(getYoutubeVideoId(new URL(value))).toBe(expected);
  });

  it("rejects lookalike YouTube hosts", () => {
    expect(
      getYoutubeVideoId(new URL("https://youtube.com.example.org/watch?v=dQw4w9WgXcQ")),
    ).toBeNull();
  });

  it("normalizes YouTube media to a canonical URL", () => {
    const parsed = feedPostInputSchema.parse({
      media: [
        {
          kind: "YOUTUBE",
          url: "https://youtu.be/dQw4w9WgXcQ?t=10",
        },
      ],
    });

    expect(normalizeFeedMedia(parsed.media)).toEqual([
      {
        kind: "YOUTUBE",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        youtubeVideoId: "dQw4w9WgXcQ",
        altText: null,
      },
    ]);
  });

  it("round-trips a stable feed cursor", () => {
    const cursor = {
      publishedAt: new Date("2026-08-12T00:00:00.000Z"),
      publicationId: "publication-1",
    };

    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
    expect(decodeFeedCursor("not-a-cursor")).toBeNull();
  });
});
