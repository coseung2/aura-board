import { describe, expect, it } from "vitest";

import { canonicalUrl, extractVideoId } from "../youtube";

const VIDEO_ID = "abcDEF123_4";

describe("youtube url parsing", () => {
  it("extracts ids from common watch and short urls", () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
    expect(extractVideoId(`https://youtu.be/${VIDEO_ID}?t=12`)).toBe(VIDEO_ID);
    expect(extractVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
  });

  it("extracts ids from embed and live urls used by stored media", () => {
    expect(extractVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
    expect(
      extractVideoId(`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`)
    ).toBe(VIDEO_ID);
    expect(extractVideoId(`https://www.youtube.com/live/${VIDEO_ID}`)).toBe(
      VIDEO_ID
    );
  });

  it("rejects non-youtube and malformed ids", () => {
    expect(extractVideoId(`https://example.com/watch?v=${VIDEO_ID}`)).toBeNull();
    expect(extractVideoId("https://www.youtube.com/embed/not-an-id")).toBeNull();
  });

  it("canonicalizes ids to watch urls", () => {
    expect(canonicalUrl(VIDEO_ID)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`
    );
  });
});
